import {
  collection,
  doc,
  GeoPoint,
  getDocFromServer,
  getDocsFromServer,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import {
  assertStructureDiffIsUnambiguous,
  buildBuildingStructureDiff,
  type BuildingStructureDiff,
  type DoorStructureTarget
} from '../../domain/workspace/building-structure';
import { fromFirestoreBuilding, fromFirestoreDoor } from './workspace-codecs';

export class StructureRevisionConflictError extends Error {
  constructor() {
    super('The building structure changed on another device.');
    this.name = 'StructureRevisionConflictError';
  }
}

export const MAX_STRUCTURE_MUTATIONS = 450;

export class StructureMutationLimitError extends Error {
  constructor(readonly mutationCount: number) {
    super(`The structure diff requires ${mutationCount} mutations; the pilot limit is ${MAX_STRUCTURE_MUTATIONS}.`);
    this.name = 'StructureMutationLimitError';
  }
}

export function assertStructureMutationBudget(diff: BuildingStructureDiff): void {
  const mutationCount = 1 + diff.created.length + diff.updated.length + diff.archivedDoorIds.length;
  if (mutationCount > MAX_STRUCTURE_MUTATIONS) throw new StructureMutationLimitError(mutationCount);
}

export type ApplyFirestoreBuildingStructureInput = {
  buildingId: string;
  expectedStructureRevision: number;
  targets: readonly DoorStructureTarget[];
  authorId: string;
  createDoorId(): string;
};

export class FirestoreBuildingStructureGateway {
  constructor(
    private readonly db: Firestore,
    private readonly workspaceId: string,
    private readonly currentUserId: () => string | null
  ) {}

  async apply(input: ApplyFirestoreBuildingStructureInput): Promise<BuildingStructureDiff> {
    if (this.currentUserId() !== input.authorId) throw new Error('The authenticated user does not own this structure change.');
    const workspace = `workspaces/${this.workspaceId}`;
    const buildingRef = doc(this.db, `${workspace}/buildings/${input.buildingId}`);
    const buildingSnapshot = await getDocFromServer(buildingRef);
    if (!buildingSnapshot.exists()) throw new Error('Building not found.');
    const building = fromFirestoreBuilding(buildingSnapshot.id, buildingSnapshot.data());
    if (building.structureRevision !== input.expectedStructureRevision) throw new StructureRevisionConflictError();
    const doorSnapshots = await getDocsFromServer(query(collection(this.db, `${workspace}/doors`), where('buildingId', '==', building.id)));
    const diff = buildBuildingStructureDiff({
      building,
      doors: doorSnapshots.docs.map((entry) => fromFirestoreDoor(entry.id, entry.data())),
      targets: input.targets,
      authorId: input.authorId,
      createDoorId: input.createDoorId
    });
    assertStructureDiffIsUnambiguous(diff);
    if (diff.building.structureRevision === building.structureRevision) return diff;
    assertStructureMutationBudget(diff);

    const batch = writeBatch(this.db);
    batch.update(buildingRef, { structureRevision: diff.building.structureRevision, updatedAt: serverTimestamp() });
    for (const door of diff.created) {
      // Le marqueur porte son nom français en base, comme dans `workspace-codecs.ts` :
      // `validDoor()` refuse `sisters`, et une porte relue sous ce nom perdrait son anneau.
      const { id: _doorId, location, sisters, ...doorData } = door;
      batch.set(doc(this.db, `${workspace}/doors/${door.id}`), {
        ...doorData,
        location: new GeoPoint(location.latitude, location.longitude),
        aConfierAuxSoeurs: sisters,
        updatedAt: serverTimestamp()
      });
    }
    for (const { doorId, ...fields } of diff.updated) {
      // `doorId` désigne le document, il n'est pas un champ : l'étaler ici ajouterait une
      // clé que la règle de mise à jour n'autorise pas.
      batch.update(doc(this.db, `${workspace}/doors/${doorId}`), { ...fields, updatedAt: serverTimestamp() });
    }
    for (const doorId of diff.archivedDoorIds) {
      batch.update(doc(this.db, `${workspace}/doors/${doorId}`), { active: false, updatedAt: serverTimestamp() });
    }
    try {
      await batch.commit();
      return diff;
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;
      if (code !== 'permission-denied') throw error;
      const latest = await getDocFromServer(buildingRef);
      if (latest.exists() && Number(latest.data().structureRevision) !== input.expectedStructureRevision) {
        throw new StructureRevisionConflictError();
      }
      throw error;
    }
  }
}
