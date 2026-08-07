import type { Outbox } from '../../domain/sync/outbox';
import type { BuildingStructureDiff } from '../../domain/workspace/building-structure';
import type { Building, Door, Status, Visit, WorkspaceMember, Zone } from '../../domain/workspace/models';
import type { ReadPage, ReadRequest } from '../../domain/workspace/read-pagination';
import { throwIfReadAborted } from '../../domain/workspace/read-pagination';
import type { WorkspaceReadRepositories, WorkspaceRepositories } from '../../domain/workspace/repositories';
import type { ApplyFirestoreBuildingStructureInput } from './firestore-building-structure-gateway';

export type StructureWriter = {
  apply(input: ApplyFirestoreBuildingStructureInput): Promise<BuildingStructureDiff>;
};

export type ZoneWriter = {
  save(zone: Zone): Promise<void>;
  delete(zoneId: string): Promise<void>;
};

export type BuildingWriter = {
  create(building: Building): Promise<void>;
};

export class TerrainDataUnavailableError extends Error {
  constructor(message = 'Les donnees terrain ne sont pas disponibles hors ligne. Preparez cette zone avant la sortie.') {
    super(message);
    this.name = 'TerrainDataUnavailableError';
  }
}

async function collectPages<T>(
  read: (request: ReadRequest) => Promise<ReadPage<T>>,
  signal?: AbortSignal
): Promise<readonly T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    throwIfReadAborted(signal);
    const page = await read({ cursor, pageSize: 100, signal });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && seenCursors.has(cursor)) throw new Error('Firestore pagination returned a repeated cursor.');
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return items;
}

function sortedDoors(doors: readonly Door[]): Door[] {
  return [...doors].sort((left, right) => left.floor - right.floor || left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
}

function sortedVisits(visits: readonly Visit[]): Visit[] {
  return [...visits].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

function requirePreparedOfflineData<T>(values: readonly T[]): readonly T[] {
  if (values.length === 0 && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new TerrainDataUnavailableError();
  }
  return values;
}

export function createTerrainSessionRepositories(input: {
  remote: WorkspaceReadRepositories;
  member: WorkspaceMember;
  outbox: Outbox;
  structureWriter: StructureWriter;
  zoneWriter: ZoneWriter;
  buildingWriter: BuildingWriter;
}): WorkspaceRepositories {
  const statuses = new Map<string, Status>();
  const zones = new Map<string, Zone>();
  const buildings = new Map<string, Building>();
  const doors = new Map<string, Door>();
  const visits = new Map<string, Visit>();

  const cacheStatuses = (values: readonly Status[]) => {
    for (const value of values) statuses.set(value.id, { ...value });
    return [...values];
  };
  const cacheZones = (values: readonly Zone[]) => {
    for (const value of values) zones.set(value.id, structuredClone(value));
    return values.map((value) => structuredClone(value));
  };
  const cacheBuildings = (values: readonly Building[]) => {
    for (const value of values) buildings.set(value.id, { ...value, location: { ...value.location } });
    return values.map((value) => ({ ...value, location: { ...value.location } }));
  };

  async function projectDoor(serverDoor: Door): Promise<Door> {
    let projected = { ...serverDoor, location: { ...serverDoor.location } };
    const pending = (await input.outbox.all())
      .filter((entry) => entry.doorId === serverDoor.id && entry.state === 'pending')
      .sort((left, right) => left.expectedRevision - right.expectedRevision || left.createdAt.localeCompare(right.createdAt));
    for (const entry of pending) {
      if (entry.expectedRevision !== projected.revision) continue;
      projected = {
        ...projected,
        currentStatusId: entry.statusId,
        revision: entry.expectedRevision + 1,
        lastVisitId: entry.commandId
      };
    }
    return projected;
  }

  async function cacheDoors(values: readonly Door[]): Promise<readonly Door[]> {
    const projected = await Promise.all(values.map(projectDoor));
    for (const value of projected) doors.set(value.id, value);
    return sortedDoors(projected).map((value) => ({ ...value, location: { ...value.location } }));
  }

  const repository: WorkspaceRepositories = {
    members: {
      listActive: () => input.remote.members.listActive(),
      async get(id) {
        if (id === input.member.id) return { ...input.member };
        return input.remote.members.get(id);
      }
    },
    statuses: {
      async list() {
        return cacheStatuses(requirePreparedOfflineData(await input.remote.statuses.list()));
      }
    },
    zones: {
      async list() {
        return cacheZones(requirePreparedOfflineData(await input.remote.zones.list()));
      },
      getStats: (zoneId) => input.remote.zones.getStats(zoneId),
      async save(zone) {
        await input.zoneWriter.save(zone);
        cacheZones([zone]);
      },
      async delete(zoneId) {
        await input.zoneWriter.delete(zoneId);
        zones.delete(zoneId);
      }
    },
    buildings: {
      async get(id) {
        const remote = await input.remote.buildings.get(id);
        if (!remote) return null;
        cacheBuildings([remote]);
        return { ...remote, location: { ...remote.location } };
      },
      async create(building) {
        await input.buildingWriter.create(building);
        cacheBuildings([building]);
      },
      async listByZone(zoneId) {
        return cacheBuildings(await collectPages((request) => input.remote.buildings.listPageByZone(zoneId, request)));
      },
      async listByViewport(viewport, request) {
        return cacheBuildings(await collectPages((pageRequest) => input.remote.buildings.listPageByViewport(viewport, pageRequest), request?.signal));
      },
      async listPageByZone(zoneId, request) {
        const page = await input.remote.buildings.listPageByZone(zoneId, request);
        return { ...page, items: cacheBuildings(page.items) };
      },
      async listPageByViewport(viewport, request) {
        const page = await input.remote.buildings.listPageByViewport(viewport, request);
        return { ...page, items: cacheBuildings(page.items) };
      }
    },
    doors: {
      async get(id) {
        const local = doors.get(id);
        if (local) return { ...local, location: { ...local.location } };
        const remote = await input.remote.doors.get(id);
        if (!remote) return null;
        return (await cacheDoors([remote]))[0] ?? null;
      },
      async listByViewport(viewport, request) {
        const values = await collectPages((pageRequest) => input.remote.doors.listPageByViewport(viewport, pageRequest), request?.signal);
        return cacheDoors(values);
      },
      async listByBuilding(buildingId) {
        const values = await collectPages((request) => input.remote.doors.listPageByBuilding(buildingId, request));
        return (await cacheDoors(values)).filter((door) => door.active);
      },
      async listStructureByBuilding(buildingId) {
        return cacheDoors(await input.remote.doors.listStructureByBuilding(buildingId));
      },
      async listPageByBuilding(buildingId, request) {
        const page = await input.remote.doors.listPageByBuilding(buildingId, request);
        return { ...page, items: await cacheDoors(page.items) };
      },
      async listPageByViewport(viewport, request) {
        const page = await input.remote.doors.listPageByViewport(viewport, request);
        return { ...page, items: await cacheDoors(page.items) };
      }
    },
    visits: {
      async listByDoor(doorId) {
        const remoteVisits = await collectPages((request) => input.remote.visits.listPageByDoor(doorId, request));
        for (const visit of remoteVisits) visits.set(visit.id, { ...visit });
        return sortedVisits([...visits.values()].filter((visit) => visit.doorId === doorId)).map((visit) => ({ ...visit }));
      },
      async listPageByDoor(doorId, request) {
        const page = await input.remote.visits.listPageByDoor(doorId, request);
        for (const visit of page.items) visits.set(visit.id, { ...visit });
        return { ...page, items: page.items.map((visit) => ({ ...visit })) };
      }
    },
    async commitVisitAndDoor(visit, door) {
      if (visit.doorId !== door.id || visit.doorRevision !== door.revision || door.lastVisitId !== visit.id) {
        throw new Error('Local visit and door projection do not form one coherent revision.');
      }
      visits.set(visit.id, { ...visit });
      doors.set(door.id, { ...door, location: { ...door.location } });
    },
    async commitVisitsAndDoors(entries) {
      for (const { visit, door } of entries) {
        if (visit.doorId !== door.id || visit.doorRevision !== door.revision || door.lastVisitId !== visit.id) {
          throw new Error('Local visit and door projection do not form one coherent revision.');
        }
      }
      for (const { visit, door } of entries) {
        visits.set(visit.id, { ...visit });
        doors.set(door.id, { ...door, location: { ...door.location } });
      }
    },
    async reconcileDoorSnapshot(snapshot) {
      const existing = doors.get(snapshot.id);
      if (!existing || existing.revision > snapshot.revision) return;
      doors.set(snapshot.id, {
        ...existing,
        currentStatusId: snapshot.currentStatusId,
        revision: snapshot.revision,
        lastVisitId: snapshot.lastVisitId
      });
    },
    async refreshDoor(doorId) {
      const remote = await input.remote.doors.get(doorId);
      if (!remote) {
        doors.delete(doorId);
        return null;
      }
      return (await cacheDoors([remote]))[0] ?? null;
    },
    async applyBuildingStructure(structureInput) {
      const diff = await input.structureWriter.apply(structureInput);
      buildings.set(diff.building.id, { ...diff.building, location: { ...diff.building.location } });
      for (const door of diff.created) doors.set(door.id, { ...door, location: { ...door.location } });
      for (const update of diff.updated) {
        const existing = doors.get(update.doorId);
        if (existing) doors.set(existing.id, { ...existing, ...update });
      }
      for (const doorId of diff.archivedDoorIds) {
        const existing = doors.get(doorId);
        if (existing) doors.set(doorId, { ...existing, active: false });
      }
      return structuredClone(diff);
    }
  };

  return repository;
}
