import { assertBuilding, assertDoor, assertEntityId } from './invariants';
import type { Building, Door, EntityId, UserId } from './models';

export type DoorStructureTarget = {
  existingDoorId?: EntityId;
  newDoorId?: EntityId;
  floor: number;
  label: string;
  sortOrder: number;
};

export type StructureAmbiguity = {
  target: DoorStructureTarget;
  candidateDoorIds: readonly EntityId[];
};

export type DoorStructureUpdate = {
  doorId: EntityId;
  floor: number;
  label: string;
  sortOrder: number;
  active: boolean;
};

export type BuildingStructureDiff = {
  building: Building;
  created: readonly Door[];
  updated: readonly DoorStructureUpdate[];
  archivedDoorIds: readonly EntityId[];
  ambiguities: readonly StructureAmbiguity[];
};

export type BuildStructureDiffInput = {
  building: Building;
  doors: readonly Door[];
  targets: readonly DoorStructureTarget[];
  authorId: UserId;
  createDoorId(): EntityId;
};

export type UniformDoorGeneration = {
  floorCount: number;
  doorsPerFloor: number;
  firstLabel: number;
};

export function normalizeDoorLabel(label: string): string {
  return label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');
}

function targetKey(target: Pick<DoorStructureTarget, 'floor' | 'label'>): string {
  return `${target.floor}\u0000${normalizeDoorLabel(target.label)}`;
}

function assertTarget(target: DoorStructureTarget): void {
  if (target.existingDoorId) assertEntityId(target.existingDoorId, 'target.existingDoorId');
  if (target.newDoorId) assertEntityId(target.newDoorId, 'target.newDoorId');
  if (target.existingDoorId && target.newDoorId) {
    throw new Error('A structure target cannot reference both an existing and a new door ID.');
  }
  if (!Number.isInteger(target.floor) || target.floor < -5 || target.floor > 200) {
    throw new Error('Door structure floor is outside the supported range.');
  }
  if (!target.label.trim() || target.label.length > 32) {
    throw new Error('Door structure label must contain 1 to 32 characters.');
  }
  if (!Number.isInteger(target.sortOrder) || target.sortOrder < 0) {
    throw new Error('Door structure sort order must be a non-negative integer.');
  }
}

export function generateUniformDoorTargets(input: UniformDoorGeneration): DoorStructureTarget[] {
  if (!Number.isInteger(input.floorCount) || input.floorCount < 1 || input.floorCount > 50) {
    throw new Error('Floor count must be between 1 and 50.');
  }
  if (!Number.isInteger(input.doorsPerFloor) || input.doorsPerFloor < 1 || input.doorsPerFloor > 100) {
    throw new Error('Door count per floor must be between 1 and 100.');
  }
  if (!Number.isInteger(input.firstLabel) || input.firstLabel < 0 || input.firstLabel > 999999) {
    throw new Error('First door label must be a supported integer.');
  }
  return Array.from({ length: input.floorCount * input.doorsPerFloor }, (_, index) => ({
    floor: Math.floor(index / input.doorsPerFloor),
    label: String(input.firstLabel + index),
    sortOrder: index
  }));
}

export function buildBuildingStructureDiff(input: BuildStructureDiffInput): BuildingStructureDiff {
  assertBuilding(input.building);
  assertEntityId(input.authorId, 'authorId');
  const doors = input.doors.filter((door) => door.buildingId === input.building.id);
  doors.forEach((door) => assertDoor(door, input.building));
  const targets = input.targets.map((target) => ({ ...target, label: target.label.trim() }));
  const targetKeys = new Set<string>();
  for (const target of targets) {
    assertTarget(target);
    const key = targetKey(target);
    if (targetKeys.has(key)) throw new Error('A structure plan cannot contain the same floor and label twice.');
    targetKeys.add(key);
  }

  const byId = new Map(doors.map((door) => [door.id, door]));
  const byLegacyKey = new Map<string, Door[]>();
  for (const door of doors) {
    const key = targetKey(door);
    byLegacyKey.set(key, [...(byLegacyKey.get(key) ?? []), door]);
  }

  const matchedDoorIds = new Set<EntityId>();
  const created: Door[] = [];
  const updated: DoorStructureUpdate[] = [];
  const ambiguities: StructureAmbiguity[] = [];

  for (const target of targets) {
    const candidates = target.newDoorId
      ? []
      : target.existingDoorId
        ? (byId.has(target.existingDoorId) ? [byId.get(target.existingDoorId)!] : [])
        : byLegacyKey.get(targetKey(target)) ?? [];
    if (target.existingDoorId && candidates.length === 0) {
      throw new Error('A structure plan references an unknown existing door.');
    }
    if (candidates.length > 1) {
      ambiguities.push({ target, candidateDoorIds: candidates.map((door) => door.id) });
      continue;
    }
    const existing = candidates[0];
    if (!existing) {
      const id = target.newDoorId ?? input.createDoorId();
      assertEntityId(id, 'generatedDoorId');
      if (byId.has(id) || created.some((door) => door.id === id)) throw new Error('Generated door IDs must be unique.');
      created.push({
        id,
        buildingId: input.building.id,
        zoneId: input.building.zoneId,
        location: { ...input.building.location },
        geohash: input.building.geohash,
        floor: target.floor,
        label: target.label,
        sortOrder: target.sortOrder,
        active: true,
        currentStatusId: 'unvisited',
        revision: 0,
        lastVisitId: null,
        createdBy: input.authorId,
        sisters: false
      });
      continue;
    }
    if (matchedDoorIds.has(existing.id)) {
      throw new Error('A structure plan cannot assign the same existing door more than once.');
    }
    matchedDoorIds.add(existing.id);
    if (
      existing.floor !== target.floor || existing.label !== target.label ||
      existing.sortOrder !== target.sortOrder || !existing.active
    ) {
      updated.push({ doorId: existing.id, floor: target.floor, label: target.label, sortOrder: target.sortOrder, active: true });
    }
  }

  if (ambiguities.length > 0) {
    return { building: input.building, created: [], updated: [], archivedDoorIds: [], ambiguities };
  }

  const archivedDoorIds = doors.filter((door) => door.active && !matchedDoorIds.has(door.id)).map((door) => door.id);
  const changed = created.length > 0 || updated.length > 0 || archivedDoorIds.length > 0;
  return {
    building: changed ? { ...input.building, structureRevision: input.building.structureRevision + 1 } : input.building,
    created,
    updated,
    archivedDoorIds,
    ambiguities
  };
}

export function assertStructureDiffIsUnambiguous(diff: BuildingStructureDiff): void {
  if (diff.ambiguities.length > 0) throw new Error('Resolve ambiguous door renames before applying the structure plan.');
}
