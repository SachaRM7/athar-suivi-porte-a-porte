import type { Zone } from '../../domain/workspace/models';
import type { FirestoreRestAuth } from './firestore-rest-auth';

type RestErrorBody = { error?: { message?: string; status?: string } };
type TransactionBody = { transaction?: string };
type RunQueryResult = { document?: { name?: string } };

export class ZoneContainsBuildingsError extends Error {
  constructor() {
    super('Suppression impossible : des bâtiments sont encore rattachés à cette zone. Aucun bâtiment, aucune porte et aucun passage n’a été supprimé.');
    this.name = 'ZoneContainsBuildingsError';
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as (T & RestErrorBody) | null;
  if (response.ok && body !== null) return body;
  const error = new Error(body?.error?.message ?? `Firestore REST request failed with HTTP ${response.status}.`) as Error & { code?: string };
  error.code = body?.error?.status?.toLowerCase().replaceAll('_', '-') ?? `http-${response.status}`;
  throw error;
}

async function authenticatedRequest(auth: FirestoreRestAuth): Promise<{
  headers: Record<string, string>;
  databaseName: string;
  documentsRoot: string;
}> {
  if (!auth.projectId) throw new Error('Firebase project ID is required for this write.');
  const token = await auth.getIdToken();
  if (!token) {
    const error = new Error('Firebase authentication is required for this write.') as Error & { code?: string };
    error.code = 'unauthenticated';
    throw error;
  }
  const project = encodeURIComponent(auth.projectId);
  return {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    databaseName: `projects/${auth.projectId}/databases/(default)`,
    documentsRoot: `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`
  };
}

function zoneFields(zone: Zone) {
  return {
    name: { stringValue: zone.name },
    color: { stringValue: zone.color },
    coverageState: { stringValue: zone.coverageState },
    assigneeLabel: zone.assigneeLabel === null ? { nullValue: null } : { stringValue: zone.assigneeLabel },
    bbox: {
      mapValue: {
        fields: {
          north: { doubleValue: zone.bbox.north },
          south: { doubleValue: zone.bbox.south },
          east: { doubleValue: zone.bbox.east },
          west: { doubleValue: zone.bbox.west }
        }
      }
    },
    geometry: {
      mapValue: {
        fields: {
          type: { stringValue: 'Polygon' },
          vertices: {
            arrayValue: {
              values: zone.geometry.coordinates.map(([longitude, latitude]) => ({
                geoPointValue: { latitude, longitude }
              }))
            }
          }
        }
      }
    }
  };
}

export async function saveZoneWithRest(auth: FirestoreRestAuth, workspaceId: string, zone: Zone): Promise<void> {
  const request = await authenticatedRequest(auth);
  const zoneName = `${request.databaseName}/documents/workspaces/${workspaceId}/zones/${zone.id}`;
  await readJson(await fetch(`https://firestore.googleapis.com/v1/${request.databaseName}/documents:commit`, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ writes: [{ update: { name: zoneName, fields: zoneFields(zone) } }] })
  }));
}

export async function deleteEmptyZoneWithRest(auth: FirestoreRestAuth, workspaceId: string, zoneId: string): Promise<void> {
  const request = await authenticatedRequest(auth);
  const beginUrl = `https://firestore.googleapis.com/v1/${request.databaseName}/documents:beginTransaction`;
  const { transaction } = await readJson<TransactionBody>(await fetch(beginUrl, {
    method: 'POST', headers: request.headers, body: '{}'
  }));
  if (!transaction) throw new Error('Firestore did not start the zone deletion transaction.');

  const rollback = async () => {
    await fetch(`https://firestore.googleapis.com/v1/${request.databaseName}/documents:rollback`, {
      method: 'POST', headers: request.headers, body: JSON.stringify({ transaction })
    }).catch(() => undefined);
  };

  try {
    const workspace = encodeURIComponent(workspaceId);
    const matches = await readJson<RunQueryResult[]>(await fetch(`${request.documentsRoot}/workspaces/${workspace}:runQuery`, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'buildings' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'zoneId' },
              op: 'EQUAL',
              value: { stringValue: zoneId }
            }
          },
          limit: 1
        },
        transaction
      })
    }));
    if (matches.some((entry) => entry.document?.name)) {
      await rollback();
      throw new ZoneContainsBuildingsError();
    }

    const zoneName = `${request.databaseName}/documents/workspaces/${workspaceId}/zones/${zoneId}`;
    await readJson(await fetch(`https://firestore.googleapis.com/v1/${request.databaseName}/documents:commit`, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        transaction,
        writes: [{ delete: zoneName, currentDocument: { exists: true } }]
      })
    }));
  } catch (error) {
    if (!(error instanceof ZoneContainsBuildingsError)) await rollback();
    throw error;
  }
}
