import { doc, serverTimestamp, updateDoc, type Firestore } from 'firebase/firestore';
import type { DoorMarkerIntent } from '../../domain/doors/contracts';
import type { DoorMarkerWriter } from '../../domain/sync/door-marker-outbox';
import type { FirestoreRestAuth } from './firestore-rest-auth';
import { applyDoorProfileWithRest } from './firestore-rest-door-writes';

/**
 * Écrit les deux champs sensibles du profil de porte.
 *
 * `updateDoc` sur ces trois clés est ce que les règles autorisent : la révision, le statut
 * et le dernier passage restent intacts. Aucun document de `passages` n'est touché —
 * l'historique reste ce qu'il est.
 */
export class FirestoreDoorMarkerGateway implements DoorMarkerWriter {
  constructor(
    private readonly db: Firestore,
    private readonly workspaceId: string,
    private readonly currentUserId: () => string | null,
    private readonly restAuth?: FirestoreRestAuth
  ) {}

  async apply(intent: DoorMarkerIntent): Promise<void> {
    if (this.currentUserId() !== intent.authorId) {
      throw new Error('The authenticated user does not own this marker change.');
    }
    if (this.restAuth) {
      await applyDoorProfileWithRest(this.restAuth, this.workspaceId, intent);
      return;
    }
    await updateDoc(doc(this.db, `workspaces/${this.workspaceId}/doors/${intent.doorId}`), {
      aConfierAuxSoeurs: intent.sisters,
      foyer: intent.foyer ?? null,
      updatedAt: serverTimestamp()
    });
  }
}
