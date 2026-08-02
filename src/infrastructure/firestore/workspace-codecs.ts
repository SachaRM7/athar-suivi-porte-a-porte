import { GeoPoint, Timestamp, type DocumentData } from 'firebase/firestore';
import type { Door, WorkspaceMember, WorkspaceSnapshot, Zone } from '../../domain/workspace/models';
import { assertDoor, assertZone } from '../../domain/workspace/invariants';

export type FirestoreSeedDocument = { path: string; data: DocumentData };

function timestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(value));
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
    ...snapshot.doors.map(({ id, location, ...door }) => ({ path: workspaceDocumentPath(root, 'doors', id), data: { ...door, location: new GeoPoint(location.latitude, location.longitude) } })),
    ...snapshot.visits.map(({ id, occurredAt, syncedAt, ...visit }) => ({ path: workspaceDocumentPath(root, 'visits', id), data: { ...visit, occurredAt: timestamp(occurredAt), syncedAt: syncedAt ? timestamp(syncedAt) : null } }))
  ];
}

export function fromFirestoreDoor(id: string, data: DocumentData): Door {
  if (!(data.location instanceof GeoPoint)) throw new Error('Door location must be a Firestore GeoPoint.');
  const door: Door = {
    id,
    buildingId: String(data.buildingId),
    zoneId: String(data.zoneId),
    location: { latitude: data.location.latitude, longitude: data.location.longitude },
    geohash: String(data.geohash),
    floor: Number(data.floor),
    label: String(data.label),
    currentStatusId: String(data.currentStatusId),
    revision: Number(data.revision),
    lastVisitId: data.lastVisitId === null ? null : String(data.lastVisitId),
    createdBy: String(data.createdBy)
  };
  assertDoor(door);
  return door;
}

export function fromFirestoreZone(id: string, data: DocumentData): Zone {
  const geometry = data.geometry as { type?: unknown; vertices?: unknown };
  if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.vertices)) {
    throw new Error('Zone geometry must use Firestore polygon vertices.');
  }
  const zone: Zone = {
    id,
    name: String(data.name),
    color: String(data.color),
    coverageState: data.coverageState as Zone['coverageState'],
    assigneeLabel: data.assigneeLabel === null ? null : String(data.assigneeLabel),
    bbox: { north: Number(data.bbox?.north), south: Number(data.bbox?.south), east: Number(data.bbox?.east), west: Number(data.bbox?.west) },
    geometry: {
      type: 'Polygon',
      coordinates: geometry.vertices.map((vertex) => [Number((vertex as { longitude?: unknown }).longitude), Number((vertex as { latitude?: unknown }).latitude)] as [number, number])
    }
  };
  assertZone(zone);
  return zone;
}

export function fromFirestoreMember(id: string, data: DocumentData): WorkspaceMember {
  if (!(data.createdAt instanceof Timestamp)) throw new Error('Member creation date must be a Firestore Timestamp.');
  const role = String(data.role);
  if (role !== 'admin' && role !== 'member') throw new Error('Member role is invalid.');
  return {
    id,
    username: String(data.username),
    displayName: String(data.displayName),
    role,
    active: data.active === true,
    createdAt: data.createdAt.toDate().toISOString()
  };
}
