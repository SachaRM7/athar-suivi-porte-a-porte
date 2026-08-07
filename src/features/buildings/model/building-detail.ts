import type { Door } from '../../../domain/workspace/models';

export type FloorProgress = {
  floor: number;
  doorCount: number;
  treatedCount: number;
  ratio: number;
};

export function compareDoorsForFloor(left: Door, right: Door): number {
  return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'fr-FR') || left.id.localeCompare(right.id);
}

export function floorProgress(doors: readonly Door[]): readonly FloorProgress[] {
  const floors = new Map<number, Door[]>();
  for (const door of doors.filter((door) => door.active)) {
    floors.set(door.floor, [...(floors.get(door.floor) ?? []), door]);
  }
  return [...floors.entries()]
    .map(([floor, floorDoors]) => {
      const treatedCount = floorDoors.filter((door) => door.currentStatusId !== 'unvisited').length;
      return { floor, doorCount: floorDoors.length, treatedCount, ratio: floorDoors.length === 0 ? 0 : treatedCount / floorDoors.length };
    })
    .sort((left, right) => left.floor - right.floor);
}

export function overallProgress(doors: readonly Door[]): FloorProgress {
  const activeDoors = doors.filter((door) => door.active);
  const treatedCount = activeDoors.filter((door) => door.currentStatusId !== 'unvisited').length;
  return { floor: 0, doorCount: activeDoors.length, treatedCount, ratio: activeDoors.length === 0 ? 0 : treatedCount / activeDoors.length };
}

export function floorLabel(floor: number): string {
  if (floor === 0) return 'RDC';
  if (floor < 0) return `S${Math.abs(floor)}`;
  return `${floor}e`;
}
