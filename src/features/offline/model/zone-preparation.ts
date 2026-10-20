import type { BoundingBox } from '../../../domain/workspace/models';
import { WORKSPACE_STATUS_IDS } from '../../../domain/workspace/status-ids';

export type PreparationQuery = {
  collection: 'members' | 'statuses' | 'zones' | 'buildings' | 'doors' | 'visits';
  id?: string;
  field?: 'zoneId' | 'buildingId' | 'doorId';
  value?: string;
};
export type PreparedDocument = { id: string; data: Record<string, unknown> };
export type QueryReceipt = { query: PreparationQuery; count: number; fingerprint: string };
export type DataReceipt = {
  schema: 1;
  projectId: string;
  workspaceId: string;
  userId: string;
  zoneId: string;
  preparedAt: string;
  queries: QueryReceipt[];
  buildingCount: number;
  doorCount: number;
};
export type MapArchive = BoundingBox & { bytes: number };
export type PreparedAssets = { version: string; shell: boolean; fonts: boolean; archives: Record<string, MapArchive> };
export const PREPARATION_DOCUMENT_BUDGET = 10_000;
export const PREPARATION_QUERY_BUDGET = 2_500;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Receipt contains only query scopes and hashes; never household data or passage notes. */
export async function fingerprint(documents: readonly PreparedDocument[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical([...documents].sort((a, b) => a.id.localeCompare(b.id)))));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareZoneData(
  identity: Pick<DataReceipt, 'projectId' | 'workspaceId' | 'userId' | 'zoneId'>,
  read: (query: PreparationQuery) => Promise<readonly PreparedDocument[]>,
  signal: AbortSignal,
  progress: (text: string) => void
): Promise<DataReceipt> {
  let documentsRead = 0;
  const queries: QueryReceipt[] = [];
  const scan = async (query: PreparationQuery) => {
    signal.throwIfAborted();
    if (queries.length >= PREPARATION_QUERY_BUDGET) throw new Error('Cette zone dépasse la capacité de préparation. Demande au coordinateur de la subdiviser.');
    const documents = await read(query);
    signal.throwIfAborted();
    documentsRead += documents.length;
    if (documentsRead > PREPARATION_DOCUMENT_BUDGET) throw new Error('Cette zone dépasse la capacité de préparation. Demande au coordinateur de la subdiviser.');
    queries.push({ query, count: documents.length, fingerprint: await fingerprint(documents) });
    return documents;
  };
  const member = await scan({ collection: 'members', id: identity.userId });
  if (member[0]?.data.active !== true) throw new Error('L’accès à cette équipe doit être confirmé en ligne.');
  const zones = await scan({ collection: 'zones' });
  const statuses = await scan({ collection: 'statuses' });
  if (!zones.some(zone => zone.id === identity.zoneId) || statuses.length === 0) throw new Error('La zone ou ses statuts ne sont plus disponibles.');
  if (WORKSPACE_STATUS_IDS.some(id => !statuses.some(status => status.id === id && status.data.active === true))) {
    throw new Error('La liste des statuts terrain est incomplète. Demande au coordinateur de la rétablir avant la préparation.');
  }
  if (zones.length > 250 || statuses.length > 250) throw new Error('La configuration de cette équipe dépasse la capacité du parcours terrain.');
  const buildings = await scan({ collection: 'buildings', field: 'zoneId', value: identity.zoneId });
  let doorCount = 0;
  const authors = new Set<string>();
  for (const [index, building] of buildings.entries()) {
    progress(`Données : bâtiment ${index + 1}/${buildings.length}`);
    const doors = await scan({ collection: 'doors', field: 'buildingId', value: building.id });
    for (const door of doors) {
      if (door.data.active === false) continue;
      doorCount++;
      const visits = await scan({ collection: 'visits', field: 'doorId', value: door.id });
      for (const visit of visits) if (typeof visit.data.authorId === 'string') authors.add(visit.data.authorId);
    }
  }
  for (const id of authors) if (id !== identity.userId) await scan({ collection: 'members', id });
  return { ...identity, schema: 1, preparedAt: new Date().toISOString(), queries, buildingCount: buildings.length, doorCount };
}

export async function verifyZoneData(receipt: DataReceipt, read: (query: PreparationQuery) => Promise<readonly PreparedDocument[]>, signal: AbortSignal): Promise<boolean> {
  if (receipt.schema !== 1 || !Array.isArray(receipt.queries) || receipt.queries.length < 4 || receipt.queries.length > PREPARATION_QUERY_BUDGET) return false;
  for (const item of receipt.queries) {
    signal.throwIfAborted();
    const documents = await read(item.query);
    if (documents.length !== item.count || await fingerprint(documents) !== item.fingerprint) return false;
  }
  return true;
}

export function coversZone(archive: BoundingBox | undefined, zone: BoundingBox): boolean {
  return Boolean(archive && archive.west <= zone.west && archive.east >= zone.east && archive.south <= zone.south && archive.north >= zone.north);
}

export function assetReadiness(assets: PreparedAssets, bbox: BoundingBox, basePath: string): { complete: boolean; details: readonly string[] } {
  const base = basePath.replace(/\/$/, '');
  const basemap = coversZone(assets.archives[`${base}/fixtures/toulouse.pmtiles`], bbox);
  const footprints = coversZone(assets.archives[`${base}/tiles/batiments-31.pmtiles`], bbox);
  const demo = Boolean(assets.archives[`${base}/fixtures/batiments-carmes.pmtiles`]);
  return {
    complete: assets.shell && assets.fonts && basemap && footprints,
    details: [
      assets.shell ? 'Interface disponible' : 'Interface incomplète',
      basemap && assets.fonts ? 'Fond de carte disponible' : 'Fond de carte incomplet pour cette zone',
      footprints ? 'Emprises disponibles' : demo ? 'Emprises de démonstration uniquement : préparation partielle' : 'Emprises indisponibles pour cette zone'
    ]
  };
}
