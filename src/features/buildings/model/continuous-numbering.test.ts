import { describe, expect, it } from 'vitest';
import { continuousBounds, continuousNumberingPreview, inferContinuousBounds } from './continuous-numbering';
import { planStructureFromPreview } from './structure-plan';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';

describe('numérotation continue de terrain', () => {
  it('répartit 28 à 39 du RDC au 3ème, trois portes par niveau', () => {
    expect(continuousNumberingPreview(4, 3, { smallest: '28', largest: '39' })).toEqual({
      floors: [['28', '29', '30'], ['31', '32', '33'], ['34', '35', '36'], ['37', '38', '39']], error: null
    });
  });
  it('calcule la borne opposée sans écraser deux valeurs saisies', () => {
    expect(continuousBounds(12, null, '39')).toEqual({ smallest: '28', largest: '39' });
    expect(continuousBounds(12, '28', null)).toEqual({ smallest: '28', largest: '39' });
    expect(continuousBounds(12, '28', '40')).toEqual({ smallest: '28', largest: '40' });
  });
  it('refuse un intervalle incompatible au lieu de créer des portes supplémentaires', () => {
    const result = continuousNumberingPreview(4, 3, { smallest: '28', largest: '40' });
    expect(result.floors).toEqual([]);
    expect(result.error).toContain('13 portes');
    expect(result.error).toContain('4 niveaux × 3 portes = 12');
  });
  it.each([
    ['', '39'], ['-1', '10'], ['1.5', '12.5'], ['A01', 'A12'], ['40', '28'], ['999999', '1000010']
  ])('refuse les bornes invalides %s et %s', (smallest, largest) => {
    expect(continuousNumberingPreview(4, 3, { smallest, largest }).error).not.toBeNull();
  });
  it('préserve les zéros initiaux et accepte un pavillon à un seul numéro', () => {
    expect(continuousNumberingPreview(1, 1, { smallest: '028', largest: '028' }).floors).toEqual([['028']]);
    expect(continuousNumberingPreview(2, 2, continuousBounds(4, '008', null)).floors).toEqual([['008', '009'], ['010', '011']]);
  });
  it('reconnaît les numéros existants et conserve les identifiants historiques', () => {
    const floors = continuousNumberingPreview(4, 3, { smallest: '28', largest: '39' }).floors;
    const doors = floors.flatMap((labels, floor) => labels.map((label, sortOrder) => ({ ...demoWorkspace.doors[0], id: `door-${label}`, active: true, floor, label, sortOrder })));
    expect(inferContinuousBounds([...doors].reverse())).toEqual({ smallest: '28', largest: '39' });
    const plan = planStructureFromPreview(floors, doors, () => 'unused');
    expect(plan.created).toBe(0); expect(plan.kept).toBe(12); expect(plan.archived).toEqual([]);
    expect(inferContinuousBounds(doors.filter(door => door.label !== '32'))).toBeNull();
    expect(inferContinuousBounds(doors.map(door => door.label === '32' ? { ...door, floor: 0 } : door))).toBeNull();
  });
});
