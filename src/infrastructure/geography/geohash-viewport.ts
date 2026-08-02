import { geohashForLocation, geohashQueryBounds } from 'geofire-common';
import type { Viewport } from '../../domain/workspace/viewport';

export type { Viewport } from '../../domain/workspace/viewport';

export type GeohashDoor = {
  id: string;
  latitude: number;
  longitude: number;
  geohash: string;
};

export type ViewportQueryResult = {
  ranges: readonly [string, string][];
  rawReadCount: number;
  uniqueReadCount: number;
  matched: GeohashDoor[];
  falsePositiveCount: number;
};

function inside(viewport: Viewport, door: GeohashDoor): boolean {
  return door.latitude >= viewport.south && door.latitude <= viewport.north &&
    door.longitude >= viewport.west && door.longitude <= viewport.east;
}

export function generateToulouseDoors(count: number): GeohashDoor[] {
  const doors: GeohashDoor[] = [];
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const latitude = 43.565 + (row + 0.5) / rows * 0.095;
    const longitude = 1.385 + (column + 0.5) / columns * 0.115;
    doors.push({
      id: `door-${index}`,
      latitude,
      longitude,
      geohash: geohashForLocation([latitude, longitude])
    });
  }
  return doors;
}

export function viewportGeohashRanges(viewport: Viewport, subdivisions = 6): readonly [string, string][] {
  const latitudeStep = (viewport.north - viewport.south) / subdivisions;
  const longitudeStep = (viewport.east - viewport.west) / subdivisions;
  const latitudeMeters = latitudeStep * 111_320;
  const centerLatitude = (viewport.north + viewport.south) / 2;
  const longitudeMeters = longitudeStep * 111_320 * Math.cos(centerLatitude * Math.PI / 180);
  const radius = Math.hypot(latitudeMeters, longitudeMeters) / 2;
  const ranges = new Map<string, [string, string]>();
  for (let row = 0; row < subdivisions; row += 1) {
    for (let column = 0; column < subdivisions; column += 1) {
      const center: [number, number] = [
        viewport.south + (row + 0.5) * latitudeStep,
        viewport.west + (column + 0.5) * longitudeStep
      ];
      for (const range of geohashQueryBounds(center, radius)) ranges.set(`${range[0]}:${range[1]}`, range);
    }
  }
  return [...ranges.values()];
}

export function queryDoorsForViewport(doors: readonly GeohashDoor[], viewport: Viewport, subdivisions = 6): ViewportQueryResult {
  const ranges = viewportGeohashRanges(viewport, subdivisions);
  const raw = ranges.flatMap(([start, end]) => doors.filter((door) => door.geohash >= start && door.geohash <= end));
  const unique = [...new Map(raw.map((door) => [door.id, door])).values()];
  const matched = unique.filter((door) => inside(viewport, door));
  return {
    ranges,
    rawReadCount: raw.length,
    uniqueReadCount: unique.length,
    matched,
    falsePositiveCount: unique.length - matched.length
  };
}
