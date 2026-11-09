import type { WorkspaceSnapshot } from '../../domain/workspace/models';
import { demoWorkspace } from '../../infrastructure/demo/demo-workspace';
import type { FieldVisitSync } from '../visits/model/use-field-visit-sync';

/** Cas de recette uniquement : en-tête complet, quatre halls et seize portes. */
export function buildingLayoutFixture(): WorkspaceSnapshot {
  const building = demoWorkspace.buildings[0];
  return {
    ...demoWorkspace,
    buildings: [{ ...building, addressLabel: `Bâtiment ${building.id}`, sections: { d0: 'D0', d1: 'D1', e0: 'E0' } }],
    doors: Array.from({ length: 16 }, (_, index) => ({
      ...demoWorkspace.doors[0], id: `layout-door-${index}`, floor: Math.floor(index / 4),
      label: `${Math.floor(index / 4)}${index % 4 + 1}`, sortOrder: index,
      currentStatusId: index >= 12 && index < 14 ? 'contacted' : 'unvisited',
      revision: index >= 12 && index < 14 ? 1 : 0,
      lastVisitId: index >= 12 && index < 14 ? `layout-visit-${index}` : null,
      lastVisitAt: index >= 12 && index < 14 ? '2026-11-09T10:00:00.000Z' : null,
      foyer: null, sisters: index === 13
    })),
    visits: [12, 13].map(index => ({
      id: `layout-visit-${index}`, doorId: `layout-door-${index}`, statusId: 'contacted', note: '', authorId: 'member-1',
      occurredAt: '2026-11-09T10:00:00.000Z', syncedAt: '2026-11-09T10:00:01.000Z', doorRevision: 1,
      replacesVisitId: null, voidedAt: null
    }))
  };
}

/** Aucun serveur ni stockage métier : expose les commandes de synchronisation en recette. */
export const layoutSync: FieldVisitSync = {
  online: true, entries: [], reconciledDoors: [], syncing: false, failedDoorId: null,
  status: { phase: 'synced', label: 'À jour', detail: 'Les saisies de cet appareil sont confirmées par le serveur.' },
  reportLocalSave: () => undefined, synchronize: async () => undefined,
  reapplyConflict: async () => undefined, abandonConflict: async () => undefined, refresh: async () => undefined
};
