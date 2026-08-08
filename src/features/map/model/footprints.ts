import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import type { Building, Door, Status, Zone, ZoneStats } from '../../../domain/workspace/models';

/**
 * Modèle de la couche cartographique du lot WP7.
 *
 * Règle structurante de `02-DATA-MODEL.md` : un bâtiment détecté mais jamais visité n'a
 * aucun document Firestore. Le gris « pas encore fait » se calcule donc ici par absence,
 * jamais par lecture d'un champ stocké, et rien dans ce fichier n'écrit quoi que ce soit.
 */

/** Priorité de dominance de `02-DATA-MODEL.md` : linked > open > away > locked > dnd. */
const STATUS_DOMINANCE: readonly string[] = ['linked', 'contacted', 'retry', 'locked', 'do-not-return'];

function dominanceRank(statusId: string): number {
  const index = STATUS_DOMINANCE.indexOf(statusId);
  return index < 0 ? STATUS_DOMINANCE.length : index;
}

/** Statut dominant d'un bâtiment, ou `null` quand aucune porte n'a de passage. */
export function dominantStatusId(doors: readonly Door[]): string | null {
  const visited = doors.filter((door) => door.lastVisitId !== null);
  if (visited.length === 0) return null;
  return visited.reduce((best, door) => (dominanceRank(door.currentStatusId) < dominanceRank(best) ? door.currentStatusId : best), visited[0]!.currentStatusId);
}

export function centerOfRing(ring: readonly (readonly [number, number])[]): [number, number] {
  if (ring.length === 0) throw new Error('Une emprise sans sommet ne peut pas être centrée.');
  const unique = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  const total = unique.reduce<[number, number]>((sum, [longitude, latitude]) => [sum[0] + longitude, sum[1] + latitude], [0, 0]);
  return [total[0] / unique.length, total[1] / unique.length];
}

export function isInsideZone(zone: Zone | null, center: readonly [number, number]): boolean {
  if (!zone) return false;
  return booleanPointInPolygon(
    point([center[0], center[1]]),
    polygon([zone.geometry.coordinates.map(([longitude, latitude]) => [longitude, latitude])])
  );
}

/**
 * État MapLibre d'une emprise. `tracked` distingue les deux couches prescrites par
 * `03-CARTO.md` : `batiments-todo` (aucun document) et `batiments-suivis` (document présent).
 */
export type FootprintState = {
  inZone: boolean;
  tracked: boolean;
  color: string;
  sisters: boolean;
};

export type FootprintContext = {
  zone: Zone | null;
  buildings: ReadonlyMap<string, Building>;
  doorsByBuilding: ReadonlyMap<string, readonly Door[]>;
  statuses: ReadonlyMap<string, Status>;
  /** Couleur de repli quand un bâtiment a un document mais aucun passage. */
  untouchedColor: string;
};

export function footprintState(rnbId: string, center: readonly [number, number], context: FootprintContext): FootprintState {
  const building = context.buildings.get(rnbId);
  const doors = context.doorsByBuilding.get(rnbId) ?? [];
  const statusId = building ? dominantStatusId(doors) : null;
  return {
    inZone: isInsideZone(context.zone, center),
    tracked: building !== undefined,
    color: (statusId ? context.statuses.get(statusId)?.color : undefined) ?? context.untouchedColor,
    // `02-DATA-MODEL.md` : le bâtiment porte le marqueur dès qu'une seule de ses portes
    // le porte. Seul l'anneau rose sort sur la carte, jamais la composition du foyer.
    sisters: building !== undefined && doors.some((door) => door.sisters)
  };
}

export function doorsByBuilding(doors: readonly Door[]): ReadonlyMap<string, readonly Door[]> {
  const grouped = new Map<string, Door[]>();
  for (const door of doors) {
    if (!door.active) continue;
    const bucket = grouped.get(door.buildingId);
    if (bucket) bucket.push(door);
    else grouped.set(door.buildingId, [door]);
  }
  return grouped;
}

/** Progression agrégée affichée sur le polygone de zone en dessous du zoom 16. */
export function zoneProgressLabel(zone: Zone, stats: ZoneStats | null): string {
  if (!stats || stats.doorCount === 0) return `${zone.name} · aucune porte décrite`;
  const untouched = stats.countsByStatus.unvisited ?? 0;
  const done = Math.max(0, stats.doorCount - untouched);
  return `${zone.name} · ${Math.round((done / stats.doorCount) * 100)} % · ${done}/${stats.doorCount} portes`;
}

/**
 * Carré d'environ `sizeInMetres` centré sur un point, pour dessiner un bâtiment posé à la
 * main : le RNB n'a pas d'emprise pour lui, mais il doit rester visible sur la carte.
 */
export function squareAround(longitude: number, latitude: number, sizeInMetres = 14): [number, number][] {
  const halfLatitude = sizeInMetres / 2 / 111_320;
  const halfLongitude = halfLatitude / Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
  return [
    [longitude - halfLongitude, latitude - halfLatitude],
    [longitude + halfLongitude, latitude - halfLatitude],
    [longitude + halfLongitude, latitude + halfLatitude],
    [longitude - halfLongitude, latitude + halfLatitude],
    [longitude - halfLongitude, latitude - halfLatitude]
  ];
}
