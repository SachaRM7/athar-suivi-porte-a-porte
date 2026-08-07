import { describe, expect, it } from 'vitest';
import type { BuildingStructureDiff } from '../../domain/workspace/building-structure';
import {
  assertStructureMutationBudget,
  StructureMutationLimitError
} from './firestore-building-structure-gateway';

function diffWithDoorMutations(count: number): BuildingStructureDiff {
  return {
    building: {} as BuildingStructureDiff['building'],
    created: Array.from({ length: count }, () => ({} as BuildingStructureDiff['created'][number])),
    updated: [],
    archivedDoorIds: [],
    ambiguities: []
  };
}

describe('Firestore building structure mutation budget', () => {
  it('accepts exactly 450 mutations including the building revision update', () => {
    expect(() => assertStructureMutationBudget(diffWithDoorMutations(449))).not.toThrow();
  });

  it('rejects 451 mutations before creating a Firestore batch', () => {
    expect(() => assertStructureMutationBudget(diffWithDoorMutations(450))).toThrow(StructureMutationLimitError);
  });
});
