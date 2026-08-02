import { describe, expect, it } from 'vitest';
import { generateToulouseDoors, queryDoorsForViewport } from './geohash-viewport';

describe('geohash viewport prototype', () => {
  it('bounds a 10,000-door Toulouse viewport query and deduplicates range reads', () => {
    const doors = generateToulouseDoors(10_000);
    const viewport = { north: 43.616, south: 43.596, east: 1.454, west: 1.426 };
    const result = queryDoorsForViewport(doors, viewport);
    const expected = doors.filter((door) => door.latitude >= viewport.south && door.latitude <= viewport.north && door.longitude >= viewport.west && door.longitude <= viewport.east);
    expect(new Set(doors.map((door) => `${door.latitude},${door.longitude}`)).size).toBe(10_000);
    expect(result.matched.map((door) => door.id).sort()).toEqual(expected.map((door) => door.id).sort());
    expect(result.ranges.length).toBe(30);
    expect(result.rawReadCount).toBe(812);
    expect(result.uniqueReadCount).toBe(812);
    expect(result.matched.length).toBe(504);
    expect(result.falsePositiveCount).toBe(308);
    expect(new Set(result.matched.map((door) => door.id)).size).toBe(result.matched.length);
  });
});
