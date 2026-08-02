import { describe, expect, it } from 'vitest';
import { layoutDoorsAtBuilding } from './door-layout';

describe('multiple doors at one building', () => {
  const doors = [
    { id: 'd3', floor: 1, label: '12' },
    { id: 'd1', floor: 0, label: '02' },
    { id: 'd2', floor: 0, label: '01' },
    { id: 'd4', floor: 2, label: '20' }
  ];

  it('gives every door a stable distinct visual position', () => {
    const layout = layoutDoorsAtBuilding(doors);
    expect(layout.map((door) => door.id)).toEqual(['d2', 'd1', 'd3', 'd4']);
    expect(new Set(layout.map((door) => `${door.x},${door.y}`)).size).toBe(4);
  });

  it('keeps a single door centered on its building', () => {
    expect(layoutDoorsAtBuilding([{ id: 'd1', floor: 0, label: '01' }])).toMatchObject([
      { x: 0, y: 0 }
    ]);
  });
});

