import { describe, expect, it } from 'vitest';
import { buildBuildingStructureDiff, generateUniformDoorTargets } from './building-structure';
import { demoWorkspace } from '../../infrastructure/demo/demo-workspace';
import type { Door } from './models';

const building = { ...demoWorkspace.buildings[0], structureRevision: 7 };

function door(index: number, active = true): Door {
  return {
    ...demoWorkspace.doors[0],
    id: `door-${index}`,
    buildingId: building.id,
    zoneId: building.zoneId,
    location: { ...building.location },
    geohash: building.geohash,
    floor: 0,
    label: String(101 + index),
    sortOrder: index,
    active,
    currentStatusId: index % 2 === 0 ? 'contacted' : 'retry',
    revision: index + 1,
    lastVisitId: `visit-${index}`
  };
}

describe('building structure diff', () => {
  it('extends ten treated doors to twelve without resetting any matched door', () => {
    const existing = Array.from({ length: 10 }, (_, index) => door(index));
    const diff = buildBuildingStructureDiff({
      building,
      doors: existing,
      targets: generateUniformDoorTargets({ floorCount: 1, doorsPerFloor: 12, firstLabel: 101 }),
      authorId: 'admin-1',
      createDoorId: (() => { let next = 11; return () => `door-${next++}`; })()
    });

    expect(diff.ambiguities).toEqual([]);
    expect(diff.building.structureRevision).toBe(8);
    expect(diff.created).toMatchObject([
      { id: 'door-11', label: '111', currentStatusId: 'unvisited', revision: 0, lastVisitId: null, active: true },
      { id: 'door-12', label: '112', currentStatusId: 'unvisited', revision: 0, lastVisitId: null, active: true }
    ]);
    expect(diff.updated).toEqual([]);
    expect(diff.archivedDoorIds).toEqual([]);
    expect(existing).toMatchObject(Array.from({ length: 10 }, (_, index) => ({
      id: `door-${index}`, revision: index + 1, lastVisitId: `visit-${index}`
    })));
  });

  it('changes sort order through a structural patch without carrying status fields', () => {
    const existing = [door(0)];
    const diff = buildBuildingStructureDiff({
      building,
      doors: existing,
      targets: [{ existingDoorId: 'door-0', floor: 0, label: '101', sortOrder: 99 }],
      authorId: 'admin-1',
      createDoorId: () => 'unused'
    });

    expect(diff.updated).toEqual([{ doorId: 'door-0', floor: 0, label: '101', sortOrder: 99, active: true }]);
    expect(diff.updated[0]).not.toHaveProperty('revision');
    expect(existing[0]).toMatchObject({ currentStatusId: 'contacted', revision: 1, lastVisitId: 'visit-0' });
  });

  it('reactivates a matching archived door with its original identity and history', () => {
    const archived = door(0, false);
    const diff = buildBuildingStructureDiff({
      building,
      doors: [archived],
      targets: [{ floor: 0, label: '101', sortOrder: 0 }],
      authorId: 'admin-1',
      createDoorId: () => 'new-door'
    });

    expect(diff.created).toEqual([]);
    expect(diff.updated).toEqual([{ doorId: 'door-0', floor: 0, label: '101', sortOrder: 0, active: true }]);
    expect(archived).toMatchObject({ revision: 1, lastVisitId: 'visit-0', active: false });
  });

  it('requires an explicit decision when legacy matching finds two doors', () => {
    const first = door(0, false);
    const second = { ...door(1, false), id: 'door-duplicate', label: '101' };
    const diff = buildBuildingStructureDiff({
      building,
      doors: [first, second],
      targets: [{ floor: 0, label: '101', sortOrder: 0 }],
      authorId: 'admin-1',
      createDoorId: () => 'new-door'
    });

    expect(diff.ambiguities).toEqual([{ target: { floor: 0, label: '101', sortOrder: 0 }, candidateDoorIds: ['door-0', 'door-duplicate'] }]);
    expect(diff.created).toEqual([]);
    expect(diff.archivedDoorIds).toEqual([]);
  });

  it('creates a new physical door with an explicit ID instead of reactivating an archived match', () => {
    const archived = door(0, false);
    const diff = buildBuildingStructureDiff({
      building,
      doors: [archived],
      targets: [{ newDoorId: 'door-physical-replacement', floor: 0, label: '101', sortOrder: 0 }],
      authorId: 'admin-1',
      createDoorId: () => 'unused'
    });

    expect(diff.created).toMatchObject([{ id: 'door-physical-replacement', revision: 0, lastVisitId: null, active: true }]);
    expect(diff.updated).toEqual([]);
    expect(archived).toMatchObject({ id: 'door-0', revision: 1, lastVisitId: 'visit-0', active: false });
  });

  it('rejects a plan that assigns one existing door to two targets', () => {
    expect(() => buildBuildingStructureDiff({
      building,
      doors: [door(0)],
      targets: [
        { existingDoorId: 'door-0', floor: 0, label: '101', sortOrder: 0 },
        { existingDoorId: 'door-0', floor: 1, label: '201', sortOrder: 1 }
      ],
      authorId: 'admin-1',
      createDoorId: () => 'unused'
    })).toThrow('A structure plan cannot assign the same existing door more than once.');
  });
});

describe('compartiments sur la même emprise', () => {
  const sectionBuilding = { ...building, sections: { 'section-b': 'Bâtiment B', 'section-c': 'Hall C' } };
  const original = { ...door(0), label: 'A01' };
  const inB = { ...door(1), id: 'door-b', label: 'A01', sectionId: 'section-b' };
  const inC = { ...door(2), id: 'door-c', label: 'A01', sectionId: 'section-c' };
  const common = { building: sectionBuilding, doors: [original, inB, inC], authorId: 'admin-1', createDoorId: () => 'new-door' };

  it('ne matérialise aucun compartiment pour le suivi historique', () => {
    const diff = buildBuildingStructureDiff({ ...common, building, doors: [original], targets: [{ existingDoorId: original.id, floor: 0, label: 'A01', sortOrder: 0 }] });
    expect(diff.building).toEqual(building);
    expect(diff.building.sections).toBeUndefined();
    expect(diff.created).toEqual([]);
    expect(diff.updated).toEqual([]);
  });

  it('ajoute un compartiment vide sans toucher aux portes déjà suivies', () => {
    const diff = buildBuildingStructureDiff({ ...common, building, doors: [original], sectionId: 'section-b', newSection: { id: 'section-b', label: ' Bâtiment B ' }, targets: [] });
    expect(diff.building.sections).toEqual({ 'section-b': 'Bâtiment B' });
    expect(diff.building.structureRevision).toBe(building.structureRevision + 1);
    expect(diff.created).toEqual([]);
    expect(diff.updated).toEqual([]);
    expect(diff.archivedDoorIds).toEqual([]);
  });

  it('autorise A01 dans B et C avec des identifiants indépendants', () => {
    const diff = buildBuildingStructureDiff({ ...common, doors: [original, inC], sectionId: 'section-b', targets: [{ floor: 0, label: 'A01', sortOrder: 0 }] });
    expect(diff.created).toHaveLength(1);
    expect(diff.created[0]).toMatchObject({ id: 'new-door', label: 'A01', sectionId: 'section-b', lastVisitId: null });
    expect(diff.archivedDoorIds).toEqual([]);
    expect(diff.updated).toEqual([]);
  });

  it('ne retire que les portes du compartiment demandé', () => {
    expect(buildBuildingStructureDiff({ ...common, sectionId: 'section-b', targets: [] }).archivedDoorIds).toEqual(['door-b']);
    expect(buildBuildingStructureDiff({ ...common, targets: [] }).archivedDoorIds).toEqual([original.id]);
  });

  it('refuse de réutiliser une porte historique appartenant à un autre compartiment', () => {
    expect(() => buildBuildingStructureDiff({ ...common, sectionId: 'section-b', targets: [{ existingDoorId: original.id, floor: 0, label: 'A01', sortOrder: 0 }] })).toThrow('unknown existing door');
  });

  it('refuse les compartiments inconnus, les noms en double et les remplacements', () => {
    expect(() => buildBuildingStructureDiff({ ...common, sectionId: 'missing', targets: [] })).toThrow('Unknown building section');
    expect(() => buildBuildingStructureDiff({ ...common, sectionId: 'new', newSection: { id: 'new', label: ' bâtiment b ' }, targets: [] })).toThrow('existe déjà');
    expect(() => buildBuildingStructureDiff({ ...common, sectionId: 'section-b', newSection: { id: 'section-b', label: 'Autre nom' }, targets: [] })).toThrow('existe déjà');
    expect(() => buildBuildingStructureDiff({ ...common, sectionId: 'new', newSection: { id: 'new', label: 'Bâtiment A' }, targets: [] })).toThrow('existe déjà');
  });
});

it('refuse un nouvel identifiant de porte déjà utilisé dans un autre compartiment', () => {
  const original = door(0);
  expect(() => buildBuildingStructureDiff({
    building: { ...building, sections: { 'hall-b': 'Hall B' } }, doors: [original], sectionId: 'hall-b',
    targets: [{ newDoorId: original.id, floor: 0, label: 'A01', sortOrder: 0 }], authorId: 'admin-1', createDoorId: () => original.id
  })).toThrow('Generated door IDs must be unique');
});
