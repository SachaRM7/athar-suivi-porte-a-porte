import type { Building, Door } from '../../../domain/workspace/models';

/**
 * Ancienneté — axe de lecture principal de `02-DATA-MODEL.md`.
 *
 * Puisque toute porte reste dans le cycle de suivi sauf « Attaché à l'effort », la question
 * utile sur le terrain n'est pas « quoi » mais « depuis quand ». Rien ici ne lit ni n'écrit
 * Firestore : l'ancienneté se déduit des passages déjà chargés.
 */

/** Seuil d'alerte visuelle de `02-DATA-MODEL.md`. Trois mois, en jours. */
export const STALE_ALERT_DAYS = 90;

const DAY_IN_MS = 86_400_000;

export type BuildingStaleness = {
  /** Date du passage le plus récent du bâtiment, `null` si personne n'y est jamais allé. */
  lastVisitAt: string | null;
  /** Nombre de jours entiers écoulés, `null` quand il n'y a aucun passage. */
  days: number | null;
  /** Libellé affiché dans la colonne d'ancienneté. */
  label: string;
  /** Vrai au-delà du seuil : la mention passe en ambre. */
  alert: boolean;
};

/** Le passage le plus récent parmi les portes actives d'un bâtiment. */
export function lastVisitOfBuilding(doors: readonly Door[]): string | null {
  return doors.reduce<string | null>((latest, door) => {
    if (!door.active || !door.lastVisitAt) return latest;
    return latest === null || door.lastVisitAt > latest ? door.lastVisitAt : latest;
  }, null);
}

function elapsedDays(lastVisitAt: string, now: Date): number {
  const startOfDay = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(new Date(lastVisitAt))) / DAY_IN_MS));
}

/** Échelle de `02-DATA-MODEL.md` : aujourd'hui · hier · il y a N j · il y a N mois · jamais vu. */
export function stalenessLabel(days: number | null): string {
  if (days === null) return 'jamais vu';
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

export function buildingStaleness(lastVisitAt: string | null, now: Date = new Date()): BuildingStaleness {
  if (lastVisitAt === null || Number.isNaN(Date.parse(lastVisitAt))) {
    // « Jamais vu » n'est pas une alerte : c'est le gris « pas encore fait », pas un retard.
    return { lastVisitAt: null, days: null, label: 'jamais vu', alert: false };
  }
  const days = elapsedDays(lastVisitAt, now);
  return { lastVisitAt, days, label: stalenessLabel(days), alert: days >= STALE_ALERT_DAYS };
}

export type BuildingListEntry = {
  building: Building;
  staleness: BuildingStaleness;
  doorCount: number;
  treatedCount: number;
};

export type BuildingListFilter = 'all' | 'todo' | 'stale';

export type BuildingListSort = 'staleness' | 'address';

export function buildingListEntries(
  buildings: readonly Building[],
  doorsByBuilding: ReadonlyMap<string, readonly Door[]>,
  now: Date = new Date()
): readonly BuildingListEntry[] {
  return buildings.map((building) => {
    const doors = (doorsByBuilding.get(building.id) ?? []).filter((door) => door.active);
    return {
      building,
      staleness: buildingStaleness(lastVisitOfBuilding(doors), now),
      doorCount: doors.length,
      treatedCount: doors.filter((door) => door.currentStatusId !== 'unvisited').length
    };
  });
}

/**
 * « Pas vu > 3 mois » ne recouvre pas « Pas encore fait » : ce sont deux piles distinctes
 * sur le terrain. La première appelle un repassage, la seconde une première visite.
 */
export function matchesBuildingListFilter(entry: BuildingListEntry, filter: BuildingListFilter): boolean {
  if (filter === 'todo') return entry.staleness.days === null;
  if (filter === 'stale') return entry.staleness.alert;
  return true;
}

/** Du plus ancien au plus récent ; un bâtiment jamais vu passe en tête. */
export function compareByStaleness(left: BuildingListEntry, right: BuildingListEntry): number {
  if (left.staleness.lastVisitAt === right.staleness.lastVisitAt) {
    return left.building.addressLabel.localeCompare(right.building.addressLabel, 'fr-FR');
  }
  if (left.staleness.lastVisitAt === null) return -1;
  if (right.staleness.lastVisitAt === null) return 1;
  return left.staleness.lastVisitAt.localeCompare(right.staleness.lastVisitAt);
}

export function sortBuildingList(
  entries: readonly BuildingListEntry[],
  sort: BuildingListSort
): readonly BuildingListEntry[] {
  return [...entries].sort((left, right) => (
    sort === 'address'
      ? left.building.addressLabel.localeCompare(right.building.addressLabel, 'fr-FR')
      : compareByStaleness(left, right)
  ));
}
