import { describe, expect, it } from 'vitest';
import type { Door } from '../../../domain/workspace/models';
import { planStructureFromPreview, structurePlanLabel } from './structure-plan';

function door(id: string, floor: number, label: string, visited = false): Door {
  return {
    id, buildingId: 'b', zoneId: 'z', location: { latitude: 0, longitude: 0 }, geohash: 's', floor, label, sortOrder: 0,
    active: true, currentStatusId: visited ? 'contacted' : 'unvisited', revision: visited ? 1 : 0,
    lastVisitId: visited ? `v-${id}` : null, lastVisitAt: visited ? '2026-10-01T10:00:00.000Z' : null, createdBy: 'm', foyer: null, sisters: false
  };
}

function ids() {
  let next = 0;
  return () => `door-new-${next++}`;
}

describe('structure plan', () => {
  it('creates every door on an empty building', () => {
    const plan = planStructureFromPreview([['01', '02'], ['11', '12']], [], ids());
    expect(plan.created).toBe(4);
    expect(plan.archived).toHaveLength(0);
    expect(structurePlanLabel(plan)).toBe('Créer 4 portes');
    expect(structurePlanLabel(planStructureFromPreview([['01']], [], ids()))).toBe('Créer 1 porte');
  });

  it('keeps the doors already described and only adds the new floor', () => {
    const existing = [door('a', 0, '01', true), door('b', 0, '02'), door('c', 1, '11', true), door('d', 1, '12')];
    const plan = planStructureFromPreview([['01', '02'], ['11', '12'], ['21', '22']], existing, ids());
    expect(plan.kept).toBe(4);
    expect(plan.created).toBe(2);
    expect(plan.archived).toHaveLength(0);
    expect(plan.targets.filter((target) => target.existingDoorId).map((target) => target.existingDoorId)).toEqual(['a', 'b', 'c', 'd']);
    expect(structurePlanLabel(plan)).toBe('Ajouter 2 portes');
  });

  it('names the doors that a smaller plan would archive', () => {
    const existing = [door('a', 0, '01', true), door('b', 0, '02'), door('c', 1, '11', true)];
    const plan = planStructureFromPreview([['01']], existing, ids());
    expect(plan.archived.map((candidate) => candidate.id)).toEqual(['b', 'c']);
    expect(structurePlanLabel(plan)).toBe('Retirer 2 portes');
    expect(structurePlanLabel(planStructureFromPreview([['01', '03']], existing, ids()))).toBe('Ajouter 1 et retirer 2 portes');
    expect(structurePlanLabel(planStructureFromPreview([['01', '02'], ['11']], existing, ids()))).toBe('Structure inchangée');
  });

  it('ignores archived doors and accent or case differences', () => {
    const archived = { ...door('x', 0, '01'), active: false };
    const plan = planStructureFromPreview([['01']], [archived, door('y', 0, ' 01 ')], ids());
    expect(plan.targets[0]?.existingDoorId).toBe('y');
  });
});
