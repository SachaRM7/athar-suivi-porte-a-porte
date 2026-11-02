import type { Building, Door } from './models';

export const DEFAULT_SECTION_ID = 'main';
export const MAX_BUILDING_SECTIONS = 50;
export const MAX_SECTION_LABEL_LENGTH = 48;
export type BuildingSection = { id: string; label: string };

/** Le suivi historique reste implicite : ouvrir un bâtiment ne crée aucun compartiment. */
export function buildingSections(building: Building): readonly BuildingSection[] {
  return [{ id: DEFAULT_SECTION_ID, label: 'Bâtiment A' },
    ...Object.entries(building.sections ?? {}).map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'fr-FR', { numeric: true, sensitivity: 'base' }))];
}

export function doorSectionId(door: Pick<Door, 'sectionId'>): string {
  return door.sectionId ?? DEFAULT_SECTION_ID;
}

export function normalizeSectionLabel(label: string): string {
  return label.normalize('NFKC').trim().replace(/\s+/g, ' ');
}
