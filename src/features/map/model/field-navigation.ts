import type { GeoPoint } from '../../../domain/workspace/models';
import type { BuildingListEntry } from '../../buildings/model/building-staleness';

export function normalizeAddress(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr-FR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function matchesAddress(address: string, search: string): boolean {
  // HYPOTHÈSE: recherche locale des seules adresses suivies, sans géocodage externe.
  const words = normalizeAddress(search).split(' ').filter(Boolean);
  const normalized = normalizeAddress(address);
  return words.every(word => normalized.includes(word));
}
/** Proximity is to the map centre, never presented as an unmeasured GPS position. */
export function markingCandidates(entries: readonly BuildingListEntry[], centre: GeoPoint): readonly BuildingListEntry[] {
  // HYPOTHÈSE: proximité du centre affiché, sans dépendre d'une permission GPS.
  const distance = (entry: BuildingListEntry) => {
    const point = entry.building.location;
    return Math.hypot((point.longitude - centre.longitude) * Math.cos(centre.latitude * Math.PI / 180), point.latitude - centre.latitude);
  };
  return entries.filter(entry => !entry.followUp.outOfFollowUp).sort((a, b) => distance(a) - distance(b) || a.building.id.localeCompare(b.building.id));
}
