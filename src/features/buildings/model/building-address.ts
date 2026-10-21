import type { Building } from '../../../domain/workspace/models';

/** Étiquette d'un bâtiment posé à la main, tant que personne n'a saisi son adresse. */
export const MANUAL_BUILDING_LABEL = 'Bâtiment posé manuellement';

/** Étiquette de repli d'une emprise : le tuileset ne porte aucune adresse (`03-CARTO.md`). */
export function footprintBuildingLabel(rnbId: string): string {
  return `Bâtiment ${rnbId}`;
}

/** Vrai tant que l'étiquette est une valeur de repli, pas une adresse saisie par un frère. */
export function hasPlaceholderAddress(building: Pick<Building, 'id' | 'addressLabel'>): boolean {
  return building.addressLabel === MANUAL_BUILDING_LABEL || building.addressLabel === footprintBuildingLabel(building.id);
}

export const MAX_ADDRESS_LENGTH = 160;

/** Adresse nettoyée, ou `null` si elle est vide. */
export function normalizeAddressLabel(value: string): string | null {
  const label = value.replace(/\s+/g, ' ').trim().slice(0, MAX_ADDRESS_LENGTH);
  return label.length > 0 ? label : null;
}
