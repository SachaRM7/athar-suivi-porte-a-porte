import type { BoundingBox, Building, Door, GeoPoint, Status, Visit, Zone } from './models';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const GEOHASH = /^[0123456789bcdefghjkmnpqrstuvwxyz]{4,12}$/;
const OPAQUE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function assertEntityId(value: string, field: string): void {
  if (!OPAQUE_ID.test(value)) throw new Error(`${field} must be an opaque identifier.`);
}

export function assertGeoPoint(point: GeoPoint, field: string): void {
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    throw new Error(`${field}.latitude must be between -90 and 90.`);
  }
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    throw new Error(`${field}.longitude must be between -180 and 180.`);
  }
}

export function assertBoundingBox(bbox: BoundingBox): void {
  assertGeoPoint({ latitude: bbox.north, longitude: bbox.east }, 'bbox.northEast');
  assertGeoPoint({ latitude: bbox.south, longitude: bbox.west }, 'bbox.southWest');
  if (bbox.south > bbox.north || bbox.west > bbox.east) throw new Error('Bounding box edges are inverted.');
}

export function assertStatus(status: Status): void {
  assertEntityId(status.id, 'status.id');
  if (!status.label.trim() || status.label.length > 48) throw new Error('Status label must contain 1 to 48 characters.');
  if (!HEX_COLOR.test(status.color)) throw new Error('Status color must be a six-digit hexadecimal color.');
  if (!Number.isInteger(status.order) || status.order < 0) throw new Error('Status order must be a positive integer.');
}

export function assertZone(zone: Zone): void {
  assertEntityId(zone.id, 'zone.id');
  if (!zone.name.trim() || zone.name.length > 80) throw new Error('Zone name must contain 1 to 80 characters.');
  if (!HEX_COLOR.test(zone.color)) throw new Error('Zone color must be a six-digit hexadecimal color.');
  assertBoundingBox(zone.bbox);
  if (zone.geometry.coordinates.length < 4 || zone.geometry.coordinates.length > 500) {
    throw new Error('Zone polygon must contain between 4 and 500 vertices.');
  }
  for (const [longitude, latitude] of zone.geometry.coordinates) assertGeoPoint({ latitude, longitude }, 'zone.geometry');
}

export function assertBuilding(building: Building): void {
  assertEntityId(building.id, 'building.id');
  assertEntityId(building.zoneId, 'building.zoneId');
  assertEntityId(building.createdBy, 'building.createdBy');
  if (!building.addressLabel.trim() || building.addressLabel.length > 160) throw new Error('Building address must contain 1 to 160 characters.');
  if (!Number.isInteger(building.structureRevision) || building.structureRevision < 0) throw new Error('Building structure revision must be a non-negative integer.');
  assertGeoPoint(building.location, 'building.location');
  if (!GEOHASH.test(building.geohash)) throw new Error('Building geohash is invalid.');
}

export function assertDoor(door: Door, building?: Building): void {
  assertEntityId(door.id, 'door.id');
  assertEntityId(door.buildingId, 'door.buildingId');
  assertEntityId(door.zoneId, 'door.zoneId');
  assertEntityId(door.createdBy, 'door.createdBy');
  if (!Number.isInteger(door.floor) || door.floor < -5 || door.floor > 200) throw new Error('Door floor is outside the supported range.');
  if (!door.label.trim() || door.label.length > 32) throw new Error('Door label must contain 1 to 32 characters.');
  if (!Number.isInteger(door.sortOrder) || door.sortOrder < 0) throw new Error('Door sort order must be a non-negative integer.');
  if (typeof door.active !== 'boolean') throw new Error('Door active state must be boolean.');
  if (typeof door.sisters !== 'boolean') throw new Error('Door sisters marker must be boolean.');
  if (!Number.isInteger(door.revision) || door.revision < 0) throw new Error('Door revision must be a non-negative integer.');
  if (door.lastVisitAt !== null && Number.isNaN(Date.parse(door.lastVisitAt))) throw new Error('Door last visit date must be a date or null.');
  // Une porte sans passage n'a pas d'ancienneté : le gris « pas encore fait » vient de
  // l'absence, jamais d'une date posée d'office.
  if (door.lastVisitId === null && door.lastVisitAt !== null) throw new Error('A door without a passage cannot carry a last visit date.');
  assertGeoPoint(door.location, 'door.location');
  if (!GEOHASH.test(door.geohash)) throw new Error('Door geohash is invalid.');
  if (building && (door.buildingId !== building.id || door.zoneId !== building.zoneId || door.geohash !== building.geohash || door.location.latitude !== building.location.latitude || door.location.longitude !== building.location.longitude)) {
    throw new Error('Door must share its building location, geohash and zone.');
  }
}

export function assertVisit(visit: Visit): void {
  assertEntityId(visit.id, 'visit.id');
  assertEntityId(visit.doorId, 'visit.doorId');
  assertEntityId(visit.authorId, 'visit.authorId');
  const containsUnsafeControl = [...visit.note].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && character !== '\n' && character !== '\r' && character !== '\t';
  });
  if (visit.note.length > 280 || containsUnsafeControl) {
    throw new Error('Visit note is invalid.');
  }
  if (!Number.isInteger(visit.doorRevision) || visit.doorRevision < 1) throw new Error('Visit door revision must be positive.');
  if (visit.voidedAt && !visit.replacesVisitId) throw new Error('A voided visit must identify its replacement relationship.');
}
