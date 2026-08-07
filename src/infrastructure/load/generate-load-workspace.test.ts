import { describe, expect, it } from 'vitest';
import { generateLoadWorkspace } from './generate-load-workspace';

describe('generated load workspace', () => {
  it('is deterministic and contains bounded slices large enough for paging proofs', () => {
    const first = generateLoadWorkspace();
    const second = generateLoadWorkspace();
    expect(first).toEqual(second);
    expect(first.buildings).toHaveLength(300);
    expect(first.doors.filter((door) => door.buildingId === 'load-building-000')).toHaveLength(180);
    expect(first.visits).toHaveLength(150);
    expect(first.doors.find((door) => door.id === 'load-door-000')).toMatchObject({
      revision: 150,
      lastVisitId: 'load-visit-149'
    });
    expect(first.visits.at(-1)).toMatchObject({ id: 'load-visit-149', doorRevision: 150 });
  });
});
