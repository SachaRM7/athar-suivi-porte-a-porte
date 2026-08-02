import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { geohashForLocation } from 'geofire-common';
import type { BoundingBox, Building, Zone, ZoneGeometry } from '../../../domain/workspace/models';

export function closePolygon(coordinates: readonly (readonly [number, number])[]): ZoneGeometry {
  if (coordinates.length < 3) throw new Error('A zone needs at least three vertices.');
  const first = coordinates[0];
  const last = coordinates.at(-1)!;
  const closed = first[0] === last[0] && first[1] === last[1]
    ? coordinates
    : [...coordinates, first];
  return { type: 'Polygon', coordinates: closed.map(([longitude, latitude]) => [longitude, latitude] as [number, number]) };
}

export function boundingBoxForPolygon(geometry: ZoneGeometry): BoundingBox {
  const longitudes = geometry.coordinates.map(([longitude]) => longitude);
  const latitudes = geometry.coordinates.map(([, latitude]) => latitude);
  return {
    north: Math.max(...latitudes), south: Math.min(...latitudes),
    east: Math.max(...longitudes), west: Math.min(...longitudes)
  };
}

export function containsBuilding(zone: Zone, building: Building): boolean {
  return booleanPointInPolygon(
    point([building.location.longitude, building.location.latitude]),
    polygon([zone.geometry.coordinates.map(([longitude, latitude]) => [longitude, latitude])])
  );
}

export function buildingsAttachedToZone(zone: Zone, buildings: readonly Building[]): readonly Building[] {
  return buildings
    .filter((building) => containsBuilding(zone, building))
    .map((building) => ({ ...building, zoneId: zone.id, geohash: geohashForLocation([building.location.latitude, building.location.longitude]) }));
}
