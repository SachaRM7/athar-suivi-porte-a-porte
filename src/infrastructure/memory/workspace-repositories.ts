import type { WorkspaceRepositories } from '../../domain/workspace/repositories';
import type { WorkspaceSnapshot } from '../../domain/workspace/models';
import { assertStructureDiffIsUnambiguous, buildBuildingStructureDiff } from '../../domain/workspace/building-structure';
import { queryDoorsForViewport } from '../geography/geohash-viewport';
import { decodeReadCursor, encodeReadCursor, pageSizeFor, responseSizeBytes, throwIfReadAborted, type ReadPage, type ReadRequest } from '../../domain/workspace/read-pagination';

function copy<T>(value: T): T {
  return structuredClone(value);
}

function pageById<T extends { id: string }>(values: readonly T[], scope: string, request?: ReadRequest): ReadPage<T> {
  throwIfReadAborted(request?.signal);
  const size = pageSizeFor(request);
  const cursor = decodeReadCursor(request?.cursor, scope);
  const after = cursor?.id;
  if (after !== undefined && typeof after !== 'string') throw new Error('Read cursor is invalid.');
  const sorted = [...values].sort((left, right) => left.id.localeCompare(right.id));
  const cursorIndex = after ? sorted.findIndex((value) => value.id === after) : -1;
  if (after && cursorIndex < 0) throw new Error('Read cursor is invalid.');
  const start = after ? cursorIndex + 1 : 0;
  const slice = sorted.slice(start, start + size);
  throwIfReadAborted(request?.signal);
  return {
    items: slice.map(copy),
    nextCursor: start + size < sorted.length && slice.length > 0 ? encodeReadCursor(scope, { id: slice.at(-1)!.id }) : null,
    metrics: { documentsRead: slice.length, returnedCount: slice.length, responseBytes: responseSizeBytes(slice), rangeCount: 0, duplicateCount: 0, falsePositiveCount: 0, durationMs: 0 }
  };
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
      async save(zone) { zones.set(zone.id, copy(zone)); },
      async delete(zoneId) { zones.delete(zoneId); zoneStats.delete(zoneId); }
    },
    buildings: {
      async get(id) { const building = buildings.get(id); return building ? copy(building) : null; },
      async create(building) {
        if (buildings.has(building.id)) throw new Error('A building with this identifier already exists.');
        if (!zones.has(building.zoneId)) throw new Error('The building zone does not exist.');
        buildings.set(building.id, copy(building));
      },
      async listByZone(zoneId) { return [...buildings.values()].filter((building) => building.zoneId === zoneId).map(copy); },
      async listPageByZone(zoneId, request) { return pageById([...buildings.values()].filter((building) => building.zoneId === zoneId), `buildings:zone:${zoneId}`, request); },
      async listByViewport(viewport, request) {
        throwIfReadAborted(request?.signal);
        const candidates = queryDoorsForViewport(
          [...buildings.values()].map((building) => ({ id: building.id, latitude: building.location.latitude, longitude: building.location.longitude, geohash: building.geohash })),
          viewport
        );
        throwIfReadAborted(request?.signal);
        return candidates.matched.map((candidate) => copy(buildings.get(candidate.id)!));
      },
      async listPageByViewport(viewport, request) {
        const candidates = queryDoorsForViewport([...buildings.values()].map((building) => ({ id: building.id, latitude: building.location.latitude, longitude: building.location.longitude, geohash: building.geohash })), viewport);
        const scope = `buildings:viewport:${viewport.north}:${viewport.south}:${viewport.east}:${viewport.west}`;
        const page = pageById(candidates.matched.map((candidate) => buildings.get(candidate.id)!), scope, request);
        return { ...page, metrics: { ...page.metrics, rangeCount: candidates.ranges.length, duplicateCount: candidates.rawReadCount - candidates.uniqueReadCount, falsePositiveCount: candidates.falsePositiveCount } };
      }
    },
    doors: {
      async get(id) { const door = doors.get(id); return door ? copy(door) : null; },
      async listByBuilding(buildingId) { return [...doors.values()].filter((door) => door.buildingId === buildingId && door.active).map(copy); },
      async listPageByBuilding(buildingId, request) { return pageById([...doors.values()].filter((door) => door.buildingId === buildingId && door.active), `doors:building:${buildingId}`, request); },
      async listStructureByBuilding(buildingId) { return [...doors.values()].filter((door) => door.buildingId === buildingId).map(copy); },
      async listByViewport(viewport, request) {
        throwIfReadAborted(request?.signal);
        const candidates = queryDoorsForViewport(
          [...doors.values()].map((door) => ({ id: door.id, latitude: door.location.latitude, longitude: door.location.longitude, geohash: door.geohash })),
          viewport
        );
        throwIfReadAborted(request?.signal);
        return candidates.matched.map((candidate) => copy(doors.get(candidate.id)!));
      },
      async listPageByViewport(viewport, request) {
        const candidates = queryDoorsForViewport([...doors.values()].map((door) => ({ id: door.id, latitude: door.location.latitude, longitude: door.location.longitude, geohash: door.geohash })), viewport);
        const scope = `doors:viewport:${viewport.north}:${viewport.south}:${viewport.east}:${viewport.west}`;
        const page = pageById(candidates.matched.map((candidate) => doors.get(candidate.id)!), scope, request);
        return { ...page, metrics: { ...page.metrics, rangeCount: candidates.ranges.length, duplicateCount: candidates.rawReadCount - candidates.uniqueReadCount, falsePositiveCount: candidates.falsePositiveCount } };
      }
    },
    visits: {
      async listByDoor(doorId) { return visits.filter((visit) => visit.doorId === doorId).map(copy); },
      async listPageByDoor(doorId, request) { return pageById(visits.filter((visit) => visit.doorId === doorId), `visits:door:${doorId}`, request); }
    },
    async commitVisitAndDoor(visit, door) {
      if (visit.doorId !== door.id || visit.doorRevision !== door.revision || door.lastVisitId !== visit.id) {
        throw new Error('Local visit and door projection do not form one coherent revision.');
      }
      visits.push(copy(visit));
      doors.set(door.id, copy(door));
    },
    async commitDoorMarker(door) {
      const existing = doors.get(door.id);
      if (!existing) throw new Error('Door not found.');
      if (existing.revision !== door.revision || existing.currentStatusId !== door.currentStatusId || existing.lastVisitId !== door.lastVisitId) {
        throw new Error('A sisters marker must not move the door revision chain.');
      }
      doors.set(door.id, copy(door));
    },
    async commitVisitsAndDoors(entries) {
      const nextVisits = entries.map(({ visit }) => copy(visit));
      const nextDoors = entries.map(({ door }) => copy(door));
      for (const { visit, door } of entries) {
        if (visit.doorId !== door.id || visit.doorRevision !== door.revision || door.lastVisitId !== visit.id) {
          throw new Error('Local visit and door projection do not form one coherent revision.');
        }
      }
      for (const visit of nextVisits) visits.push(visit);
      for (const door of nextDoors) doors.set(door.id, door);
    },
    async reconcileDoorSnapshot(snapshot) {
      const existing = doors.get(snapshot.id);
      if (!existing) throw new Error(`Cannot reconcile an unknown door: ${snapshot.id}`);
      doors.set(snapshot.id, copy({
        ...existing,
        currentStatusId: snapshot.currentStatusId,
        revision: snapshot.revision,
        lastVisitId: snapshot.lastVisitId
      }));
    },
    async refreshDoor(doorId) {
      const door = doors.get(doorId);
      return door ? copy(door) : null;
    },
    async applyBuildingStructure(input) {
      const building = buildings.get(input.buildingId);
      if (!building) throw new Error(`Unknown building: ${input.buildingId}`);
      if (building.structureRevision !== input.expectedStructureRevision) {
        throw new Error('Building structure changed on another device.');
      }
      const diff = buildBuildingStructureDiff({
        building,
        doors: [...doors.values()],
        targets: input.targets,
        authorId: input.authorId,
        createDoorId: input.createDoorId
      });
      assertStructureDiffIsUnambiguous(diff);
      buildings.set(building.id, copy(diff.building));
      for (const door of diff.created) doors.set(door.id, copy(door));
      for (const update of diff.updated) {
        const existing = doors.get(update.doorId);
        if (!existing) throw new Error(`Unknown door: ${update.doorId}`);
        doors.set(existing.id, copy({ ...existing, ...update, id: existing.id }));
      }
      for (const doorId of diff.archivedDoorIds) {
        const existing = doors.get(doorId);
        if (!existing) throw new Error(`Unknown door: ${doorId}`);
        doors.set(existing.id, copy({ ...existing, active: false }));
      }
      return copy(diff);
    }
  };
}
