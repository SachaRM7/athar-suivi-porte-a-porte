import type { Building, Door } from '../../../domain/workspace/models';
import type { ReadPage, ReadRequest } from '../../../domain/workspace/read-pagination';
import type { WorkspaceReadRepositories } from '../../../domain/workspace/repositories';
import { mapLimited, readTask } from '../../../shared/async/read-task';

// HYPOTHÈSE: 25 buildings per page, four concurrent reads, a 10,000-document ceiling.
export const TERRAIN_PAGE_SIZE = 25;
export const TERRAIN_READ_CONCURRENCY = 4;
export const TERRAIN_DOCUMENT_BUDGET = 10_000;

/** Fully read each building before deriving any status, follow-up suggestion or count. */
export async function loadBuildingDoors(repositories: WorkspaceReadRepositories, buildings: readonly Building[], signal: AbortSignal) {
  let documentsRead = 0;
  const groups = await mapLimited(buildings, TERRAIN_READ_CONCURRENCY, signal, async building => {
    const doors: Door[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      signal.throwIfAborted();
      const page: ReadPage<Door> = await readTask(repositories.doors.listPageByBuilding(building.id, { cursor, pageSize: 100, signal }), signal);
      documentsRead += page.metrics.documentsRead;
      if (documentsRead > TERRAIN_DOCUMENT_BUDGET) throw new Error('Trop de portes pour ce cadrage. Rapproche la carte ou choisis un secteur plus petit.');
      doors.push(...page.items);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('Lecture interrompue. Réessaie depuis le début de la liste.');
      if (cursor) seen.add(cursor);
      if (seen.size > 100) throw new Error('Ce bâtiment dépasse la capacité de lecture. Demande au coordinateur de vérifier sa structure.');
    } while (cursor);
    return doors;
  });
  return { doors: groups.flat(), documentsRead };
}

export async function loadTerrainPage(repositories: WorkspaceReadRepositories, zoneId: string, request: ReadRequest & { signal: AbortSignal }) {
  const page = await readTask(repositories.buildings.listPageByZone(zoneId, { ...request, pageSize: TERRAIN_PAGE_SIZE }), request.signal);
  const result = await loadBuildingDoors(repositories, page.items, request.signal);
  return { buildings: page.items, doors: result.doors, nextCursor: page.nextCursor, documentsRead: page.metrics.documentsRead + result.documentsRead };
}
