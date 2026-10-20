import type { DoorMarkerIntent, DoorSnapshot, VisitIntent } from '../../domain/doors/contracts';
import { NetworkUnavailableError, RevisionConflictError, SyncRejectedError } from '../../domain/sync/sync-service';
import { firestoreRestApi, type FirestoreRestAuth } from './firestore-rest-auth';

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
    documentsRoot: `${firestoreRestApi(auth)}/projects/${project}/databases/(default)/documents`
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

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
}

/** Réseau absent, délai dépassé ou serveur en difficulté : rien n'est perdu, on réessaiera. */
function isTransient(error: unknown): boolean {
  if (error instanceof TypeError) return true; // `fetch` échoue ainsi quand le réseau manque.
  const code = errorCode(error);
  return ['unavailable', 'deadline-exceeded', 'cancelled', 'resource-exhausted', 'internal', 'aborted'].includes(code) ||
    /^http-(5\d\d|408|429)$/.test(code);
}

async function readOptional(url: string, headers: Record<string, string>): Promise<RestDocument | null> {
  const response = await fetch(url, { headers });
  if (response.status === 404) return null;
  return readJson(response) as Promise<RestDocument>;
}

/**
 * Un refus de sécurité n'a pas toujours la même cause. On la cherche comme le chemin SDK :
 * membre suspendu, statut désactivé, sinon refus de sécurité. Aucun ne se « réessaie » seul.
 */
async function diagnosePermissionDenied(auth: FirestoreRestAuth, workspaceId: string, intent: VisitIntent): Promise<never> {
  const request = await authenticatedRequest(auth);
  const workspace = `${request.documentsRoot}/workspaces/${encodeURIComponent(workspaceId)}`;
  const member = await readOptional(`${workspace}/members/${encodeURIComponent(intent.authorId)}`, request.headers).catch(() => null);
  const memberFields = member?.fields as Record<string, { booleanValue?: boolean }> | undefined;
  if (!member || memberFields?.active?.booleanValue !== true) {
    throw new SyncRejectedError('inactive-member', 'The member is no longer active.');
  }
  const status = await readOptional(`${workspace}/statuses/${encodeURIComponent(intent.statusId)}`, request.headers).catch(() => null);
  const statusFields = status?.fields as Record<string, { booleanValue?: boolean }> | undefined;
  if (!status || statusFields?.active?.booleanValue !== true) {
    throw new SyncRejectedError('invalid-intent', 'The queued visit is invalid.');
  }
  throw new SyncRejectedError('security', 'Firestore rejected the queued visit.');
}

/**
 * Envoie un passage en attente par l'API REST. Chaque échec est classé : temporaire
 * (l'intention reste en file), conflit de révision, ou rejet définitif à montrer.
 */
export async function commitVisitWithRest(
  auth: FirestoreRestAuth,
  workspaceId: string,
  intent: VisitIntent
): Promise<DoorSnapshot> {
  try {
    return await sendVisitWithRest(auth, workspaceId, intent);
  } catch (error) {
    if (error instanceof RevisionConflictError || error instanceof SyncRejectedError || error instanceof NetworkUnavailableError) throw error;
    if (isTransient(error)) throw new NetworkUnavailableError(error instanceof TypeError ? 'offline' : 'server');
    const code = errorCode(error);
    if (code === 'unauthenticated') throw new NetworkUnavailableError('session', 'Firebase session expired.');
    if (code === 'not-found') throw new SyncRejectedError('invalid-intent', 'The queued visit targets a door that no longer exists.');
    if (code === 'permission-denied') {
      try {
        return await diagnosePermissionDenied(auth, workspaceId, intent);
      } catch (diagnosis) {
        if (diagnosis instanceof SyncRejectedError) throw diagnosis;
        throw new NetworkUnavailableError('server');
      }
    }
    if (code === 'invalid-argument' || code === 'failed-precondition') {
      throw new SyncRejectedError('invalid-intent', 'The queued visit is invalid.');
    }
    throw error;
  }
}

async function sendVisitWithRest(
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
          ...(intent.outingId ? { outingId: { stringValue: intent.outingId } } : {}),
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
    await readJson(await fetch(`${firestoreRestApi(auth)}/${request.databaseName}/documents:commit`, {
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
  await readJson(await fetch(`${firestoreRestApi(auth)}/${request.databaseName}/documents:commit`, {
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
