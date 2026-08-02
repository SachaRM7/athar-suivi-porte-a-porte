import { describe, expect, it } from 'vitest';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { boundingBoxForPolygon, buildingsAttachedToZone, closePolygon, containsBuilding } from './zone-geometry';

describe('zone geometry', () => {
  it('closes a drawn polygon and derives its Firestore bounding box', () => {
    const geometry = closePolygon([[1.44, 43.60], [1.46, 43.60], [1.46, 43.62], [1.44, 43.62]]);
    expect(geometry.coordinates).toHaveLength(5);
    expect(boundingBoxForPolygon(geometry)).toEqual({ north: 43.62, south: 43.60, east: 1.46, west: 1.44 });
  });

  it('attaches only buildings inside the edited zone and refreshes their geohash', () => {
    const zone = demoWorkspace.zones[0];
    const outside = { ...demoWorkspace.buildings[0], id: 'building-outside', location: { latitude: 43.63, longitude: 1.47 } };
    expect(containsBuilding(zone, demoWorkspace.buildings[0])).toBe(true);
    expect(containsBuilding(zone, outside)).toBe(false);

    const attached = buildingsAttachedToZone(zone, [...demoWorkspace.buildings, outside]);
    expect(attached.map((building) => building.id).sort()).toEqual(['building-carmes', 'building-dalbad']);
    expect(attached.every((building) => building.zoneId === 'carmes')).toBe(true);
    expect(attached.every((building) => building.geohash.length >= 4)).toBe(true);
  });
});
