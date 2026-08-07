import { deleteDoc, doc, setDoc, type Firestore } from 'firebase/firestore';
import type { Zone } from '../../domain/workspace/models';

export class FirestoreZoneGateway {
  constructor(
    private readonly db: Firestore,
    private readonly workspaceId: string,
    private readonly currentUserId: () => string | null
  ) {}

  async save(zone: Zone): Promise<void> {
    if (!this.currentUserId()) throw new Error('An authenticated administrator is required to save a zone.');
    await setDoc(doc(this.db, `workspaces/${this.workspaceId}/zones/${zone.id}`), {
      name: zone.name,
      color: zone.color,
      coverageState: zone.coverageState,
      assigneeLabel: zone.assigneeLabel,
      bbox: zone.bbox,
      geometry: {
        type: 'Polygon',
        vertices: zone.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }))
      }
    });
  }

  async delete(zoneId: string): Promise<void> {
    if (!this.currentUserId()) throw new Error('An authenticated administrator is required to delete a zone.');
    await deleteDoc(doc(this.db, `workspaces/${this.workspaceId}/zones/${zoneId}`));
  }
}
