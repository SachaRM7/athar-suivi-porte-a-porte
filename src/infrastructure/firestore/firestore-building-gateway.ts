import { GeoPoint, doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { Building, Status } from '../../domain/workspace/models';

const DEFAULT_STATUSES: readonly Status[] = [
  { id: 'unvisited', label: 'Pas visite', color: '#8C9494', order: 0, active: true },
  { id: 'contacted', label: 'Contact etabli', color: '#16835F', order: 1, active: true },
  { id: 'retry', label: 'A revenir', color: '#D8A200', order: 2, active: true },
  { id: 'do-not-return', label: 'Ne pas deranger', color: '#B8403B', order: 3, active: true }
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
}
