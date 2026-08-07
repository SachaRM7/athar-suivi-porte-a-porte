import { describe, expect, it } from 'vitest';
import { generateToulouseDoors, normalizeGeohashRanges, queryDoorsForViewport } from './geohash-viewport';

describe('geohash viewport prototype', () => {
  it('bounds a 10,000-door Toulouse viewport query and deduplicates range reads', () => {
    const doors = generateToulouseDoors(10_000);
    const viewport = { north: 43.616, south: 43.596, east: 1.454, west: 1.426 };
    const result = queryDoorsForViewport(doors, viewport);
    const expected = doors.filter((door) => door.latitude >= viewport.south && door.latitude <= viewport.north && door.longitude >= viewport.west && door.longitude <= viewport.east);
    expect(new Set(doors.map((door) => `${door.latitude},${door.longitude}`)).size).toBe(10_000);
    expect(result.matched.map((door) => door.id).sort()).toEqual(expected.map((door) => door.id).sort());
    expect(result.ranges.length).toBe(20);
    expect(result.rawReadCount).toBeGreaterThanOrEqual(result.uniqueReadCount);
    expect(result.matched.length).toBe(504);
    expect(result.falsePositiveCount).toBe(result.uniqueReadCount - result.matched.length);
    expect(new Set(result.matched.map((door) => door.id)).size).toBe(result.matched.length);
  });
});

describe('geohash range normalization', () => {
  it('merges overlapping ranges before paged reads can cross a range boundary', () => {
    expect(normalizeGeohashRanges([['spc1', 'spc3'], ['spc2', 'spc4'], ['spc7', 'spc8']])).toEqual([['spc1', 'spc4'], ['spc7', 'spc8']]);
  });
});
