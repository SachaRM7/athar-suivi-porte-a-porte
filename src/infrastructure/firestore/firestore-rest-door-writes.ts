import type { DoorMarkerIntent, DoorSnapshot, VisitIntent } from '../../domain/doors/contracts';
import { RevisionConflictError } from '../../domain/sync/sync-service';
import type { FirestoreRestAuth } from './firestore-rest-auth';

type RestValue = {
  stringValue?: string;
  integerValue?: string;
  nullValue?: null;
  timestampValue?: string;
};

type RestDocument = {
  name: string;
  fields?: Record<string, RestValue>;
  updateTime?: string;
};

type RestErrorBody = { error?: { message?: string; status?: string } };

async function readJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null) as RestErrorBody | null;
  if (response.ok) return body;
  const error = new Error(body?.error?.message ?? `Firestore REST request failed with HTTP ${response.status}.`) as Error & { code?: string };
  error.code = body?.error?.status?.toLowerCase().replaceAll('_', '-') ?? `http-${response.status}`;
  throw error;
}

async function authenticatedRequest(auth: FirestoreRestAuth): Promise<{ headers: Record<string, string>; databaseName: string; documentsRoot: string }> {
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

function requiredString(document: RestDocument, field: string): string {
  const value = document.fields?.[field]?.stringValue;
  if (typeof value !== 'string') throw new Error(`Firestore REST field ${field} must be a string.`);
  return value;
}

function doorSnapshot(document: RestDocument): DoorSnapshot {
  const revision = Number(document.fields?.revision?.integerValue);
  if (!Number.isInteger(revision)) throw new Error('Firestore REST field revision must be an integer.');
  const lastVisitValue = document.fields?.lastVisitId;
  return {
    id: document.name.split('/').at(-1) ?? '',
    currentStatusId: requiredString(document, 'currentStatusId'),
    revision,
    lastVisitId: typeof lastVisitValue?.stringValue === 'string' ? lastVisitValue.stringValue : null,
    lastVisitAt: document.fields?.lastVisitAt?.timestampValue ?? null
  };
}

function matchesIntent(snapshot: DoorSnapshot, intent: VisitIntent): boolean {
  return snapshot.revision === intent.expectedRevision + 1 &&
    snapshot.currentStatusId === intent.statusId && snapshot.lastVisitId === intent.commandId;
}

export async function commitVisitWithRest(
  auth: FirestoreRestAuth,
  workspaceId: string,
  intent: VisitIntent
): Promise<DoorSnapshot> {
  const request = await authenticatedRequest(auth);
  const workspace = encodeURIComponent(workspaceId);
  const doorId = encodeURIComponent(intent.doorId);
  const doorUrl = `${request.documentsRoot}/workspaces/${workspace}/doors/${doorId}`;
  const readDoor = async () => readJson(await fetch(doorUrl, { headers: request.headers })) as Promise<RestDocument>;
  const doorDocument = await readDoor();
  const before = doorSnapshot(doorDocument);
  if (matchesIntent(before, intent)) return before;
  if (before.revision !== intent.expectedRevision) throw new RevisionConflictError(before);

  const visitName = `${request.databaseName}/documents/workspaces/${workspaceId}/visits/${intent.commandId}`;
  const doorName = `${request.databaseName}/documents/workspaces/${workspaceId}/doors/${intent.doorId}`;
  const writes = [
    {
      update: {
        name: visitName,
        fields: {
          doorId: { stringValue: intent.doorId },
          statusId: { stringValue: intent.statusId },
          note: { stringValue: intent.note },
          authorId: { stringValue: intent.authorId },
          occurredAt: { timestampValue: intent.createdAt },
          doorRevision: { integerValue: String(intent.expectedRevision + 1) }
        }
      },
      updateTransforms: [{ fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false }
    },
    {
      update: {
        name: doorName,
        fields: {
          currentStatusId: { stringValue: intent.statusId },
          revision: { integerValue: String(intent.expectedRevision + 1) },
          lastVisitId: { stringValue: intent.commandId },
          lastVisitAt: { timestampValue: intent.createdAt }
        }
      },
      updateMask: { fieldPaths: ['currentStatusId', 'revision', 'lastVisitId', 'lastVisitAt'] },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      ...(doorDocument.updateTime ? { currentDocument: { updateTime: doorDocument.updateTime } } : { currentDocument: { exists: true } })
    }
  ];

  try {
    await readJson(await fetch(`https://firestore.googleapis.com/v1/${request.databaseName}/documents:commit`, {
      method: 'POST', headers: request.headers, body: JSON.stringify({ writes })
    }));
  } catch (error) {
    const latest = doorSnapshot(await readDoor());
    if (matchesIntent(latest, intent)) return latest;
    if (latest.revision !== intent.expectedRevision) throw new RevisionConflictError(latest);
    throw error;
  }
  return {
    id: intent.doorId,
    currentStatusId: intent.statusId,
    revision: intent.expectedRevision + 1,
    lastVisitId: intent.commandId,
    lastVisitAt: intent.createdAt
  };
}

export async function applyDoorProfileWithRest(
  auth: FirestoreRestAuth,
  workspaceId: string,
  intent: DoorMarkerIntent
): Promise<void> {
  const request = await authenticatedRequest(auth);
  const doorName = `${request.databaseName}/documents/workspaces/${workspaceId}/doors/${intent.doorId}`;
  await readJson(await fetch(`https://firestore.googleapis.com/v1/${request.databaseName}/documents:commit`, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({
      writes: [{
        update: {
          name: doorName,
          fields: {
            aConfierAuxSoeurs: { booleanValue: intent.sisters },
            foyer: intent.foyer === null ? { nullValue: null } : { stringValue: intent.foyer }
          }
        },
        updateMask: { fieldPaths: ['aConfierAuxSoeurs', 'foyer'] },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: true }
      }]
    })
  }));
}
