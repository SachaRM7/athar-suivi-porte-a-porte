import type { Building, Door, Status, Visit, WorkspaceMember, Zone, ZoneStats } from './models';
import type { Viewport } from './viewport';

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
}

export interface BuildingRepository {
  get(id: string): Promise<Building | null>;
  listByZone(zoneId: string): Promise<readonly Building[]>;
  listByViewport(viewport: Viewport): Promise<readonly Building[]>;
}

export interface DoorRepository {
  get(id: string): Promise<Door | null>;
  listByViewport(viewport: Viewport): Promise<readonly Door[]>;
  listByBuilding(buildingId: string): Promise<readonly Door[]>;
}

export interface VisitRepository {
  listByDoor(doorId: string): Promise<readonly Visit[]>;
}

export type WorkspaceRepositories = {
  members: MemberRepository;
  statuses: StatusRepository;
  zones: ZoneRepository;
  buildings: BuildingRepository;
  doors: DoorRepository;
  visits: VisitRepository;
};
