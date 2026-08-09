import {
  collection,
  doc,
  getDocFromServer,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import type { DoorSnapshot, VisitIntent } from '../../domain/doors/contracts';
import { NetworkUnavailableError, RevisionConflictError, SyncRejectedError, type DoorWriteGateway } from '../../domain/sync/sync-service';
import type { FirestoreRestAuth } from './firestore-rest-auth';
import { commitVisitWithRest } from './firestore-rest-door-writes';

export class FirestoreDoorGateway implements DoorWriteGateway {
  constructor(
    private readonly db: Firestore,
    private readonly workspaceId: string,
    private readonly currentUserId: () => string | null,
    private readonly isNetworkAvailable: () => boolean = () => typeof navigator === 'undefined' || navigator.onLine !== false,
    private readonly restAuth?: FirestoreRestAuth
  ) {}

  async commit(intent: VisitIntent): Promise<DoorSnapshot> {
    if (!this.isNetworkAvailable()) throw new NetworkUnavailableError();
    if (this.currentUserId() !== intent.authorId) {
      throw new SyncRejectedError('author-mismatch', 'The authenticated user does not own this queued visit.');
    }
    const validNote = typeof intent.note === 'string';
    const containsUnsafeControl = validNote && [...intent.note].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && character !== '\n' && character !== '\r' && character !== '\t';
    });
    const invalidDocumentId = (value: unknown) => typeof value !== 'string' || !value || value.length > 256 || value.includes('/') || value === '.' || value === '..';
    if (
      invalidDocumentId(intent.commandId) || invalidDocumentId(intent.authorId) ||
      invalidDocumentId(intent.doorId) || invalidDocumentId(intent.statusId) ||
      !Number.isInteger(intent.expectedRevision) || intent.expectedRevision < 0 ||
      !validNote || intent.note.length > 280 || containsUnsafeControl ||
      typeof intent.createdAt !== 'string' || Number.isNaN(Date.parse(intent.createdAt))
    ) {
      throw new SyncRejectedError('invalid-intent', 'The queued visit is invalid.');
    }

    // En production, l'API REST authentifiée ne dépend pas du cache IndexedDB du SDK.
    // L'écriture reste atomique et soumise aux mêmes règles Firestore.
    if (this.restAuth) return commitVisitWithRest(this.restAuth, this.workspaceId, intent);

    const workspace = `workspaces/${this.workspaceId}`;
    const doorRef = doc(this.db, `${workspace}/doors/${intent.doorId}`);
    const visitRef = doc(collection(this.db, `${workspace}/visits`), intent.commandId);
    const batch = writeBatch(this.db);

    batch.set(visitRef, {
      doorId: intent.doorId,
      statusId: intent.statusId,
      note: intent.note,
      authorId: intent.authorId,
      occurredAt: Timestamp.fromDate(new Date(intent.createdAt)),
      syncedAt: serverTimestamp(),
      doorRevision: intent.expectedRevision + 1
    });
    batch.update(doorRef, {
      currentStatusId: intent.statusId,
      revision: intent.expectedRevision + 1,
      lastVisitId: intent.commandId,
      // Même horodatage que `occurredAt` du passage : l'ancienneté lue sur le terrain est
      // celle du passage, pas celle de la synchronisation.
      lastVisitAt: Timestamp.fromDate(new Date(intent.createdAt)),
      updatedAt: serverTimestamp()
    });

    try {
      await batch.commit();
      return {
        id: intent.doorId,
        currentStatusId: intent.statusId,
        revision: intent.expectedRevision + 1,
        lastVisitId: intent.commandId,
        lastVisitAt: intent.createdAt
      };
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;
      if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'cancelled') {
        throw new NetworkUnavailableError();
      }
      if (code !== 'permission-denied') throw error;

      const memberRef = doc(this.db, `${workspace}/members/${intent.authorId}`);
      const member = await getDocFromServer(memberRef);
      if (!member.exists() || member.data().active !== true) {
        throw new SyncRejectedError('inactive-member', 'The member is no longer active.');
      }
      const serverDoor = await getDocFromServer(doorRef);
      if (
        serverDoor.exists() &&
        Number(serverDoor.data().revision) === intent.expectedRevision + 1 &&
        serverDoor.data().lastVisitId === intent.commandId &&
        serverDoor.data().currentStatusId === intent.statusId
      ) {
        return {
          id: intent.doorId,
          currentStatusId: serverDoor.data().currentStatusId,
          revision: Number(serverDoor.data().revision),
          lastVisitId: intent.commandId,
          lastVisitAt: intent.createdAt
        };
      }
      const status = await getDocFromServer(doc(this.db, `${workspace}/statuses/${intent.statusId}`));
      if (!status.exists() || status.data().active !== true) {
        throw new SyncRejectedError('invalid-intent', 'The queued visit is invalid.');
      }
      if (serverDoor.exists() && Number(serverDoor.data().revision) > intent.expectedRevision) {
        const serverVisitAt = serverDoor.data().lastVisitAt;
        throw new RevisionConflictError({
          id: intent.doorId,
          currentStatusId: serverDoor.data().currentStatusId,
          revision: Number(serverDoor.data().revision),
          lastVisitId: serverDoor.data().lastVisitId ?? null,
          lastVisitAt: serverVisitAt instanceof Timestamp ? serverVisitAt.toDate().toISOString() : null
        });
      }
      throw new SyncRejectedError('security', `Firestore rejected the queued visit: ${String(error)}`);
    }
  }
}
