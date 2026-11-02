import type { Door } from '../../../domain/workspace/models';

export type ContinuousBounds = { smallest: string; largest: string };
export type ContinuousPreview = { floors: string[][]; error: string | null };
const INTEGER_LABEL = /^\d{1,6}$/;

function numericLabel(value: string): number | null {
  return INTEGER_LABEL.test(value.trim()) ? Number(value.trim()) : null;
}

function padLike(value: number, reference: string): string {
  return String(value).padStart(reference.trim().startsWith('0') ? reference.trim().length : 1, '0');
}

/** Une seule borne saisie suffit ; deux bornes saisies sont contrôlées, jamais corrigées en silence. */
export function continuousBounds(
  doorCount: number,
  smallest: string | null,
  largest: string | null,
  initialSmallest = '1'
): ContinuousBounds {
  const bottom = smallest ?? (largest !== null
    ? (numericLabel(largest) === null ? '' : padLike(Number(largest) - doorCount + 1, largest))
    : initialSmallest);
  const top = largest ?? (numericLabel(bottom) === null ? '' : padLike(Number(bottom) + doorCount - 1, bottom));
  return { smallest: bottom, largest: top };
}

export function continuousNumberingPreview(
  levels: number, doorsPerFloor: number, bounds: ContinuousBounds
): ContinuousPreview {
  if (!Number.isInteger(levels) || levels < 1 || levels > 21 || !Number.isInteger(doorsPerFloor) || doorsPerFloor < 1 || doorsPerFloor > 50) {
    return { floors: [], error: 'Indique entre 1 et 21 niveaux et entre 1 et 50 portes par étage.' };
  }
  const smallest = numericLabel(bounds.smallest);
  const largest = numericLabel(bounds.largest);
  if (smallest === null || largest === null) return { floors: [], error: 'Saisis des numéros entiers entre 0 et 999999.' };
  if (largest < smallest) return { floors: [], error: 'Le numéro du dernier étage doit être supérieur ou égal à celui du RDC.' };
  const capacity = levels * doorsPerFloor;
  const span = largest - smallest + 1;
  if (span !== capacity) return { floors: [], error: `De ${bounds.smallest} à ${bounds.largest} : ${span} portes, mais ${levels} niveaux × ${doorsPerFloor} portes = ${capacity}. Ajuste les numéros ou le nombre de portes par étage.` };
  const padding = Math.max(bounds.smallest.trim().startsWith('0') ? bounds.smallest.trim().length : 1,
    bounds.largest.trim().startsWith('0') ? bounds.largest.trim().length : 1);
  return {
    floors: Array.from({ length: levels }, (_, floor) => Array.from({ length: doorsPerFloor }, (_, index) => String(smallest + floor * doorsPerFloor + index).padStart(padding, '0'))),
    error: null
  };
}

/** Reconnaît seulement une suite complète, correctement répartie, sans inventer de portes manquantes. */
export function inferContinuousBounds(doors: readonly Door[]): ContinuousBounds | null {
  const active = doors.filter(door => door.active);
  if (!active.length || active.some(door => door.floor < 0 || numericLabel(door.label) === null)) return null;
  const sorted = [...active].sort((a, b) => a.floor - b.floor || Number(a.label) - Number(b.label));
  const levels = sorted.at(-1)!.floor + 1;
  const perFloor = sorted.filter(door => door.floor === 0).length;
  const bounds = { smallest: sorted[0].label, largest: sorted.at(-1)!.label };
  const preview = continuousNumberingPreview(levels, perFloor, bounds);
  if (preview.error || sorted.length !== levels * perFloor) return null;
  return sorted.every((door, index) => door.floor === Math.floor(index / perFloor) && door.label === preview.floors[door.floor][index % perFloor]) ? bounds : null;
}
