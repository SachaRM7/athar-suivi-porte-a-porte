import type { Door } from '../../../domain/workspace/models';
import { normalizeDoorLabel, type DoorStructureTarget } from '../../../domain/workspace/building-structure';

export type StructurePlan = {
  targets: readonly DoorStructureTarget[];
  created: number;
  kept: number;
  /** Portes actives absentes du nouveau plan : elles seraient archivées. */
  archived: readonly Door[];
};

function doors(count: number): string {
  return `${count} porte${count > 1 ? 's' : ''}`;
}

/**
 * Traduit l'aperçu du dialogue de structure en plan applicable. Une porte déjà décrite au
 * même étage, sous le même numéro, est conservée avec son identité — donc son historique
 * et sa couleur. Sans cela, revalider la structure d'un immeuble archivait toutes ses portes.
 */
export function planStructureFromPreview(
  preview: readonly (readonly string[])[],
  structureDoors: readonly Door[],
  createDoorId: () => string
): StructurePlan {
  const available = new Map<string, Door[]>();
  for (const door of structureDoors.filter((candidate) => candidate.active)) {
    const key = `${door.floor}\u0000${normalizeDoorLabel(door.label)}`;
    available.set(key, [...(available.get(key) ?? []), door]);
  }
  const matched = new Set<string>();
  const targets = preview.flatMap((labels, floor) => labels.map((label, index): DoorStructureTarget => {
    const sortOrder = floor * labels.length + index;
    const existing = available.get(`${floor}\u0000${normalizeDoorLabel(label)}`)?.find((door) => !matched.has(door.id));
    if (existing) {
      matched.add(existing.id);
      return { floor, label, sortOrder, existingDoorId: existing.id };
    }
    return { floor, label, sortOrder, newDoorId: createDoorId() };
  }));
  const archived = structureDoors.filter((door) => door.active && !matched.has(door.id));
  return { targets, created: targets.length - matched.size, kept: matched.size, archived };
}

/** Le bouton dit ce qu'il fait : « Créer 16 portes », « Ajouter 2 portes », « Retirer 3 portes ». */
export function structurePlanLabel(plan: StructurePlan): string {
  if (plan.kept === 0 && plan.archived.length === 0) return `Créer ${doors(plan.created)}`;
  if (plan.created > 0 && plan.archived.length > 0) return `Ajouter ${plan.created} et retirer ${doors(plan.archived.length)}`;
  if (plan.created > 0) return `Ajouter ${doors(plan.created)}`;
  if (plan.archived.length > 0) return `Retirer ${doors(plan.archived.length)}`;
  return 'Structure inchangée';
}
