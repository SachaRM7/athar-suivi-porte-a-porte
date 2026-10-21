import { hasRecordedVisit } from '../../../domain/workspace/status-ids';
import { doorFollowUp } from '../../../domain/workspace/follow-up';
import type { Door } from '../../../domain/workspace/models';

export type FloorProgress = {
  floor: number;
  doorCount: number;
  treatedCount: number;
  ratio: number;
  /** Portes jamais visitées : seules cibles de « tout marquer absent » (`02-DATA-MODEL.md`). */
  firstVisitCount: number;
  /** Portes visitées sans contact établi (« Absent », « Accès bloqué ») : un étage n'est pas terminé pour autant. */
  toRevisitCount: number;
};

/** « Absent » et « Accès bloqué » restent dans le cycle : il faudra repasser. */
const TO_REVISIT_STATUS_IDS: readonly string[] = ['retry', 'locked'];

function countFollowUp(doors: readonly Door[]): Pick<FloorProgress, 'firstVisitCount' | 'toRevisitCount'> {
  return {
    firstVisitCount: doors.filter((door) => doorFollowUp(door) === 'first-visit').length,
    toRevisitCount: doors.filter((door) => door.active && hasRecordedVisit(door) && TO_REVISIT_STATUS_IDS.includes(door.currentStatusId)).length
  };
}

/**
 * Un étage est « terminé » quand toutes ses portes ont eu un passage et qu'aucune n'est à revoir.
 * Trois « Absent » ne terminent pas un étage : ils disent qu'il faudra revenir à une autre heure.
 */
export function isFloorComplete(progress: FloorProgress): boolean {
  return progress.doorCount > 0 && progress.firstVisitCount === 0 && progress.toRevisitCount === 0;
}

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
      const treatedCount = floorDoors.filter(hasRecordedVisit).length;
      return { floor, doorCount: floorDoors.length, treatedCount, ratio: floorDoors.length === 0 ? 0 : treatedCount / floorDoors.length, ...countFollowUp(floorDoors) };
    })
    .sort((left, right) => left.floor - right.floor);
}

export function overallProgress(doors: readonly Door[]): FloorProgress {
  const activeDoors = doors.filter((door) => door.active);
  const treatedCount = activeDoors.filter(hasRecordedVisit).length;
  return { floor: 0, doorCount: activeDoors.length, treatedCount, ratio: activeDoors.length === 0 ? 0 : treatedCount / activeDoors.length, ...countFollowUp(activeDoors) };
}

export function floorLabel(floor: number): string {
  if (floor === 0) return 'RDC';
  if (floor < 0) return `Sous-sol ${Math.abs(floor)}`;
  return floor === 1 ? '1er' : `${floor}ème`;
}
