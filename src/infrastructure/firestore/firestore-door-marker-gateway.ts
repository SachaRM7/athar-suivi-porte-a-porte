import { doc, serverTimestamp, updateDoc, type Firestore } from 'firebase/firestore';
import type { DoorMarkerIntent } from '../../domain/doors/contracts';
import type { DoorMarkerWriter } from '../../domain/sync/door-marker-outbox';

/**
 * Écrit le seul champ `aConfierAuxSoeurs`.
 *
 * `updateDoc` sur ces deux clés est ce que les règles autorisent : la révision, le statut
 * et le dernier passage restent intacts. Aucun document de `passages` n'est touché —
 * l'historique reste ce qu'il est.
 */
export class FirestoreDoorMarkerGateway implements DoorMarkerWriter {
  constructor(
    private readonly db: Firestore,
    private readonly workspaceId: string,
    private readonly currentUserId: () => string | null
  ) {}

  async apply(intent: DoorMarkerIntent): Promise<void> {
    if (this.currentUserId() !== intent.authorId) {
      throw new Error('The authenticated user does not own this marker change.');
    }
    await updateDoc(doc(this.db, `workspaces/${this.workspaceId}/doors/${intent.doorId}`), {
      aConfierAuxSoeurs: intent.sisters,
      updatedAt: serverTimestamp()
    });
  }
}
