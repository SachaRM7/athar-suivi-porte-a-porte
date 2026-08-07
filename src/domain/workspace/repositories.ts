import type { Building, Door, Status, Visit, WorkspaceMember, Zone, ZoneStats } from './models';
import type { Viewport } from './viewport';
import type { DoorSnapshot } from '../doors/contracts';
import type { BuildingStructureDiff, DoorStructureTarget } from './building-structure';
import type { ReadPage, ReadRequest } from './read-pagination';

export interface MemberRepository {
  listActive(): Promise<readonly WorkspaceMember[]>;
  get(id: string): Promise<WorkspaceMember | null>;
}

export interface StatusRepository {
  list(): Promise<readonly Status[]>;
}

export interface ZoneRepository {
  list(): Promise<readonly Zone[]>;
  getStats(zoneId: string): Promise<ZoneStats | null>;
  save(zone: Zone): Promise<void>;
  delete(zoneId: string): Promise<void>;
}

export interface BuildingRepository {
  get(id: string): Promise<Building | null>;
  create(building: Building): Promise<void>;
  listByZone(zoneId: string): Promise<readonly Building[]>;
  listByViewport(viewport: Viewport, request?: Pick<ReadRequest, 'signal'>): Promise<readonly Building[]>;
  listPageByZone(zoneId: string, request?: ReadRequest): Promise<ReadPage<Building>>;
  listPageByViewport(viewport: Viewport, request?: ReadRequest): Promise<ReadPage<Building>>;
}

export interface DoorRepository {
  get(id: string): Promise<Door | null>;
  listByViewport(viewport: Viewport, request?: Pick<ReadRequest, 'signal'>): Promise<readonly Door[]>;
  listByBuilding(buildingId: string): Promise<readonly Door[]>;
  listStructureByBuilding(buildingId: string): Promise<readonly Door[]>;
  listPageByBuilding(buildingId: string, request?: ReadRequest): Promise<ReadPage<Door>>;
  listPageByViewport(viewport: Viewport, request?: ReadRequest): Promise<ReadPage<Door>>;
}

export interface VisitRepository {
  listByDoor(doorId: string): Promise<readonly Visit[]>;
  listPageByDoor(doorId: string, request?: ReadRequest): Promise<ReadPage<Visit>>;
}

/** Read-only boundary for screens that must not couple themselves to Firestore. */
export type WorkspaceReadRepositories = {
  members: Pick<MemberRepository, 'listActive' | 'get'>;
  statuses: Pick<StatusRepository, 'list'>;
  zones: Pick<ZoneRepository, 'list' | 'getStats'>;
  buildings: Pick<BuildingRepository, 'get' | 'listByZone' | 'listByViewport' | 'listPageByZone' | 'listPageByViewport'>;
  doors: Pick<DoorRepository, 'get' | 'listByViewport' | 'listByBuilding' | 'listStructureByBuilding' | 'listPageByBuilding' | 'listPageByViewport'>;
  visits: Pick<VisitRepository, 'listByDoor' | 'listPageByDoor'>;
};

export type WorkspaceRepositories = {
  members: MemberRepository;
  statuses: StatusRepository;
  zones: ZoneRepository;
  buildings: BuildingRepository;
  doors: DoorRepository;
  visits: VisitRepository;
  commitVisitAndDoor(visit: Visit, door: Door): Promise<void>;
  commitVisitsAndDoors(entries: readonly { visit: Visit; door: Door }[]): Promise<void>;
  reconcileDoorSnapshot(snapshot: DoorSnapshot): Promise<void>;
  refreshDoor(doorId: string): Promise<Door | null>;
  applyBuildingStructure(input: {
    buildingId: string;
    expectedStructureRevision: number;
    targets: readonly DoorStructureTarget[];
    authorId: string;
    createDoorId(): string;
  }): Promise<BuildingStructureDiff>;
};
