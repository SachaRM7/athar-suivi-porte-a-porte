import type { WorkspaceRepositories } from '../../domain/workspace/repositories';
import type { WorkspaceSnapshot } from '../../domain/workspace/models';
import { queryDoorsForViewport } from '../geography/geohash-viewport';

function copy<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryWorkspaceRepositories(snapshot: WorkspaceSnapshot): WorkspaceRepositories {
  const members = new Map(snapshot.members.map((member) => [member.id, copy(member)]));
  const statuses = snapshot.statuses.map(copy);
  const zones = new Map(snapshot.zones.map((zone) => [zone.id, copy(zone)]));
  const zoneStats = new Map(snapshot.zoneStats.map((stats) => [stats.zoneId, copy(stats)]));
  const buildings = new Map(snapshot.buildings.map((building) => [building.id, copy(building)]));
  const doors = new Map(snapshot.doors.map((door) => [door.id, copy(door)]));
  const visits = snapshot.visits.map(copy);

  return {
    members: {
      async listActive() { return [...members.values()].filter((member) => member.active).map(copy); },
      async get(id) { const member = members.get(id); return member ? copy(member) : null; }
    },
    statuses: { async list() { return [...statuses].sort((left, right) => left.order - right.order).map(copy); } },
    zones: {
      async list() { return [...zones.values()].map(copy); },
      async getStats(zoneId) { const stats = zoneStats.get(zoneId); return stats ? copy(stats) : null; },
      async save(zone) { zones.set(zone.id, copy(zone)); }
    },
    buildings: {
      async get(id) { const building = buildings.get(id); return building ? copy(building) : null; },
      async listByZone(zoneId) { return [...buildings.values()].filter((building) => building.zoneId === zoneId).map(copy); },
      async listByViewport(viewport) {
        const candidates = queryDoorsForViewport(
          [...buildings.values()].map((building) => ({ id: building.id, latitude: building.location.latitude, longitude: building.location.longitude, geohash: building.geohash })),
          viewport
        );
        return candidates.matched.map((candidate) => copy(buildings.get(candidate.id)!));
      }
    },
    doors: {
      async get(id) { const door = doors.get(id); return door ? copy(door) : null; },
      async listByBuilding(buildingId) { return [...doors.values()].filter((door) => door.buildingId === buildingId).map(copy); },
      async listByViewport(viewport) {
        const candidates = queryDoorsForViewport(
          [...doors.values()].map((door) => ({ id: door.id, latitude: door.location.latitude, longitude: door.location.longitude, geohash: door.geohash })),
          viewport
        );
        return candidates.matched.map((candidate) => copy(doors.get(candidate.id)!));
      }
    },
    visits: { async listByDoor(doorId) { return visits.filter((visit) => visit.doorId === doorId).map(copy); } }
  };
}
