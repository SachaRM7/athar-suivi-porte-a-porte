import { GeoPoint, collection, deleteDoc, doc, getDocs, limit, query, runTransaction, serverTimestamp, where, type Firestore } from 'firebase/firestore';
import type { Building, Status } from '../../domain/workspace/models';

const DEFAULT_STATUSES: readonly Status[] = [
  { id: 'unvisited', label: 'Pas encore fait', color: '#8B948F', order: 0, active: true },
  { id: 'contacted', label: 'Contact établi', color: '#1F7A5A', order: 1, active: true },
  { id: 'retry', label: 'Absent', color: '#C87A0A', order: 2, active: true },
  { id: 'linked', label: "Attaché à l'effort", color: '#2456A6', order: 3, active: true },
  { id: 'do-not-return', label: 'Ne pas déranger', color: '#A93B2E', order: 4, active: true },
  { id: 'locked', label: 'Accès bloqué', color: '#6B5AA8', order: 5, active: true }
];

export class FirestoreBuildingGateway {
  constructor(
    private readonly db: Firestore,
    private readonly workspaceId: string,
    private readonly currentUserId: () => string | null
  ) {}

  async create(building: Building): Promise<void> {
    if (this.currentUserId() !== building.createdBy) throw new Error('The authenticated user does not own this building creation.');
    const workspace = `workspaces/${this.workspaceId}`;
    const buildingRef = doc(this.db, `${workspace}/buildings/${building.id}`);
    const zoneRef = doc(this.db, `${workspace}/zones/${building.zoneId}`);
    await runTransaction(this.db, async (transaction) => {
      const [existingBuilding, zone, ...statusSnapshots] = await Promise.all([
        transaction.get(buildingRef),
        transaction.get(zoneRef),
        ...DEFAULT_STATUSES.map((status) => transaction.get(doc(this.db, `${workspace}/statuses/${status.id}`)))
      ]);
      if (existingBuilding.exists()) throw new Error('A building with this identifier already exists.');
      if (!zone.exists()) throw new Error('Select an existing zone before creating a building.');
      DEFAULT_STATUSES.forEach((status, index) => {
        if (!statusSnapshots[index]?.exists()) {
          transaction.set(doc(this.db, `${workspace}/statuses/${status.id}`), {
            label: status.label,
            color: status.color,
            order: status.order,
            active: status.active
          });
        }
      });
      transaction.set(buildingRef, {
        addressLabel: building.addressLabel,
        location: new GeoPoint(building.location.latitude, building.location.longitude),
        geohash: building.geohash,
        zoneId: building.zoneId,
        createdBy: building.createdBy,
        structureRevision: 0,
        updatedAt: serverTimestamp()
      });
    });
  }

  /**
   * Le refus porte sur toute porte encore présente, active ou archivée : ses passages
   * sont immuables et ne doivent jamais se retrouver sans bâtiment parent.
   *
   * Les portes vivent dans la collection plate `doors` du workspace, pas sous le
   * bâtiment : interroger une sous-collection inexistante sortait du périmètre des
   * règles et faisait échouer la suppression sur un refus de lecture.
   */
  async delete(buildingId: string): Promise<void> {
    const workspace = `workspaces/${this.workspaceId}`;
    const doors = await getDocs(query(
      collection(this.db, `${workspace}/doors`),
      where('buildingId', '==', buildingId),
      limit(1)
    ));
    if (!doors.empty) throw new Error('Retire d’abord les portes de ce bâtiment : leurs passages ne peuvent pas rester sans bâtiment.');
    await deleteDoc(doc(this.db, `${workspace}/buildings/${buildingId}`));
  }
}
