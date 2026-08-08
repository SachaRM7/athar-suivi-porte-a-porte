import { GeoPoint, Timestamp, type DocumentData } from 'firebase/firestore';
import type { Building, Door, Status, Visit, WorkspaceMember, WorkspaceSnapshot, Zone, ZoneStats } from '../../domain/workspace/models';
import { assertBuilding, assertDoor, assertEntityId, assertStatus, assertVisit, assertZone } from '../../domain/workspace/invariants';

export type FirestoreSeedDocument = { path: string; data: DocumentData };

function timestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(value));
}

function requiredString(data: DocumentData, field: string): string {
  if (typeof data[field] !== 'string') throw new Error(`${field} must be a string.`);
  return data[field];
}

function requiredNumber(data: DocumentData, field: string): number {
  if (typeof data[field] !== 'number') throw new Error(`${field} must be a number.`);
  return data[field];
}

export function workspaceDocumentPath(workspaceId: string, collection: string, id: string): string {
  return `workspaces/${workspaceId}/${collection}/${id}`;
}

export function toFirestoreSeedDocuments(snapshot: WorkspaceSnapshot): FirestoreSeedDocument[] {
  const root = snapshot.id;
  return [
    ...snapshot.members.map(({ id, ...member }) => ({ path: workspaceDocumentPath(root, 'members', id), data: { ...member, createdAt: timestamp(member.createdAt) } })),
    ...snapshot.statuses.map(({ id, ...status }) => ({ path: workspaceDocumentPath(root, 'statuses', id), data: status })),
    ...snapshot.zones.map(({ id, geometry, ...zone }) => ({
      path: workspaceDocumentPath(root, 'zones', id),
      data: { ...zone, geometry: { type: geometry.type, vertices: geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })) } }
    })),
    ...snapshot.zoneStats.map(({ zoneId, ...stats }) => ({ path: workspaceDocumentPath(root, 'zoneStats', zoneId), data: { ...stats, updatedAt: timestamp(stats.updatedAt) } })),
    ...snapshot.buildings.map(({ id, location, ...building }) => ({ path: workspaceDocumentPath(root, 'buildings', id), data: { ...building, location: new GeoPoint(location.latitude, location.longitude) } })),
    ...snapshot.doors.map(({ id, location, sisters, lastVisitAt, ...door }) => ({ path: workspaceDocumentPath(root, 'doors', id), data: { ...door, location: new GeoPoint(location.latitude, location.longitude), lastVisitAt: lastVisitAt ? timestamp(lastVisitAt) : null, aConfierAuxSoeurs: sisters } })),
    ...snapshot.visits.map(({ id, occurredAt, syncedAt, ...visit }) => ({ path: workspaceDocumentPath(root, 'visits', id), data: { ...visit, occurredAt: timestamp(occurredAt), syncedAt: syncedAt ? timestamp(syncedAt) : null } }))
  ];
}

export function fromFirestoreDoor(id: string, data: DocumentData): Door {
  if (!(data.location instanceof GeoPoint)) throw new Error('Door location must be a Firestore GeoPoint.');
  if (typeof data.active !== 'boolean') throw new Error('Door active state must be boolean.');
  if (data.lastVisitId !== null && typeof data.lastVisitId !== 'string') throw new Error('Door last visit must be a string or null.');
  if (data.lastVisitAt !== null && data.lastVisitAt !== undefined && !(data.lastVisitAt instanceof Timestamp)) {
    throw new Error('Door last visit date must be a Firestore Timestamp or null.');
  }
  const door: Door = {
    id,
    buildingId: requiredString(data, 'buildingId'),
    zoneId: requiredString(data, 'zoneId'),
    location: { latitude: data.location.latitude, longitude: data.location.longitude },
    geohash: requiredString(data, 'geohash'),
    floor: requiredNumber(data, 'floor'),
    label: requiredString(data, 'label'),
    sortOrder: requiredNumber(data, 'sortOrder'),
    active: data.active,
    currentStatusId: requiredString(data, 'currentStatusId'),
    revision: requiredNumber(data, 'revision'),
    lastVisitId: data.lastVisitId,
    // Absente des portes écrites avant WP8 : une porte sans date n'est pas invalide,
    // elle se lit « jamais vu » comme n'importe quelle porte sans passage.
    lastVisitAt: data.lastVisitId && data.lastVisitAt instanceof Timestamp ? data.lastVisitAt.toDate().toISOString() : null,
    createdBy: requiredString(data, 'createdBy'),
    // Les anciennes portes n'avaient pas encore ce champ : elles se relisent comme
    // « Non renseigné », sans inventer une information sensible.
    foyer: ['femme', 'homme', 'couple', 'famille'].includes(data.foyer) ? data.foyer : null,
    // Le champ garde son nom français du `02-DATA-MODEL.md`. Absent des portes créées
    // avant ce lot : une porte sans marqueur n'est pas une porte invalide.
    sisters: data.aConfierAuxSoeurs === true
  };
  assertDoor(door);
  assertEntityId(door.currentStatusId, 'door.currentStatusId');
  if (door.lastVisitId) assertEntityId(door.lastVisitId, 'door.lastVisitId');
  return door;
}

export function fromFirestoreBuilding(id: string, data: DocumentData): Building {
  if (!(data.location instanceof GeoPoint)) throw new Error('Building location must be a Firestore GeoPoint.');
  const building: Building = {
    id,
    addressLabel: requiredString(data, 'addressLabel'),
    location: { latitude: data.location.latitude, longitude: data.location.longitude },
    geohash: requiredString(data, 'geohash'),
    zoneId: requiredString(data, 'zoneId'),
    createdBy: requiredString(data, 'createdBy'),
    structureRevision: requiredNumber(data, 'structureRevision')
  };
  assertBuilding(building);
  return building;
}

export function fromFirestoreZone(id: string, data: DocumentData): Zone {
  const geometry = data.geometry as { type?: unknown; vertices?: unknown };
  if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.vertices)) {
    throw new Error('Zone geometry must use Firestore polygon vertices.');
  }
  const coverageState = data.coverageState;
  if (typeof coverageState !== 'string' || !['unassigned', 'prepared', 'active', 'complete'].includes(coverageState)) {
    throw new Error('Zone coverage state is invalid.');
  }
  if (data.assigneeLabel !== null && typeof data.assigneeLabel !== 'string') throw new Error('Zone assignee label must be a string or null.');
  if (!data.bbox || typeof data.bbox !== 'object') throw new Error('Zone bounding box is invalid.');
  const coordinates = geometry.vertices.map((vertex) => {
    if (!vertex || typeof vertex !== 'object') throw new Error('Zone vertex is invalid.');
    const latitude = (vertex as { latitude?: unknown }).latitude;
    const longitude = (vertex as { longitude?: unknown }).longitude;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') throw new Error('Zone vertex coordinates must be numbers.');
    return [longitude, latitude] as [number, number];
  });
  const zone: Zone = {
    id,
    name: requiredString(data, 'name'),
    color: requiredString(data, 'color'),
    coverageState: coverageState as Zone['coverageState'],
    assigneeLabel: data.assigneeLabel,
    bbox: {
      north: requiredNumber(data.bbox, 'north'), south: requiredNumber(data.bbox, 'south'),
      east: requiredNumber(data.bbox, 'east'), west: requiredNumber(data.bbox, 'west')
    },
    geometry: {
      type: 'Polygon',
      coordinates
    }
  };
  assertZone(zone);
  return zone;
}

export function fromFirestoreStatus(id: string, data: DocumentData): Status {
  const status: Status = {
    id,
    label: requiredString(data, 'label'),
    color: requiredString(data, 'color'),
    order: requiredNumber(data, 'order'),
    active: data.active === true
  };
  assertStatus(status);
  if (typeof data.active !== 'boolean') throw new Error('Status active state must be boolean.');
  return status;
}

export function fromFirestoreZoneStats(zoneId: string, data: DocumentData): ZoneStats {
  assertEntityId(zoneId, 'zoneStats.zoneId');
  if (!(data.updatedAt instanceof Timestamp)) throw new Error('Zone stats update date must be a Firestore Timestamp.');
  if (!Number.isInteger(data.doorCount) || data.doorCount < 0) throw new Error('Zone stats door count must be a non-negative integer.');
  if (!data.countsByStatus || typeof data.countsByStatus !== 'object' || Array.isArray(data.countsByStatus)) {
    throw new Error('Zone stats counts must be an object.');
  }
  const countsByStatus: Record<string, number> = {};
  for (const [statusId, count] of Object.entries(data.countsByStatus)) {
    assertEntityId(statusId, 'zoneStats.statusId');
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) throw new Error('Zone stats status count must be a non-negative integer.');
    countsByStatus[statusId] = count;
  }
  const projectedCount = Object.values(countsByStatus).reduce((total, count) => total + count, 0);
  if (projectedCount > data.doorCount) throw new Error('Zone stats status counts exceed the door count.');
  return { zoneId, doorCount: data.doorCount, countsByStatus, updatedAt: data.updatedAt.toDate().toISOString() };
}

export function fromFirestoreVisit(id: string, data: DocumentData): Visit {
  if (!(data.occurredAt instanceof Timestamp)) throw new Error('Visit occurrence date must be a Firestore Timestamp.');
  if (data.syncedAt !== null && !(data.syncedAt instanceof Timestamp)) throw new Error('Visit sync date must be a Firestore Timestamp or null.');
  if (data.voidedAt !== null && data.voidedAt !== undefined && !(data.voidedAt instanceof Timestamp)) throw new Error('Visit void date must be a Firestore Timestamp or null.');
  const visit: Visit = {
    id,
    doorId: requiredString(data, 'doorId'),
    statusId: requiredString(data, 'statusId'),
    note: requiredString(data, 'note'),
    authorId: requiredString(data, 'authorId'),
    occurredAt: data.occurredAt.toDate().toISOString(),
    syncedAt: data.syncedAt ? data.syncedAt.toDate().toISOString() : null,
    doorRevision: requiredNumber(data, 'doorRevision'),
    replacesVisitId: data.replacesVisitId === null || data.replacesVisitId === undefined ? null : requiredString(data, 'replacesVisitId'),
    voidedAt: data.voidedAt ? data.voidedAt.toDate().toISOString() : null
  };
  assertVisit(visit);
  assertEntityId(visit.statusId, 'visit.statusId');
  if (visit.replacesVisitId) assertEntityId(visit.replacesVisitId, 'visit.replacesVisitId');
  return visit;
}

export function fromFirestoreMember(id: string, data: DocumentData): WorkspaceMember {
  if (!(data.createdAt instanceof Timestamp)) throw new Error('Member creation date must be a Firestore Timestamp.');
  const role = String(data.role);
  if (role !== 'admin' && role !== 'member') throw new Error('Member role is invalid.');
  if (typeof data.active !== 'boolean') throw new Error('Member active state must be boolean.');
  const username = requiredString(data, 'username');
  const displayName = requiredString(data, 'displayName');
  if (!username.trim() || username.length > 32) throw new Error('Member username is invalid.');
  if (!displayName.trim() || displayName.length > 80) throw new Error('Member display name is invalid.');
  return {
    id,
    username,
    displayName,
    role,
    active: data.active,
    createdAt: data.createdAt.toDate().toISOString()
  };
}
