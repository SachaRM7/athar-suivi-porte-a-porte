export type EntityId = string;
export type WorkspaceId = string;
export type UserId = string;
export type StatusId = string;

export type MemberRole = 'admin' | 'member';

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type BoundingBox = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type ZoneGeometry = {
  type: 'Polygon';
  coordinates: readonly (readonly [number, number])[];
};

export type WorkspaceMember = {
  id: UserId;
  username: string;
  displayName: string;
  role: MemberRole;
  active: boolean;
  createdAt: string;
};

export type Status = {
  id: StatusId;
  label: string;
  color: string;
  order: number;
  active: boolean;
};

export type Zone = {
  id: EntityId;
  name: string;
  geometry: ZoneGeometry;
  bbox: BoundingBox;
  color: string;
  coverageState: 'unassigned' | 'prepared' | 'active' | 'complete';
  assigneeLabel: string | null;
};

export type ZoneStats = {
  zoneId: EntityId;
  doorCount: number;
  countsByStatus: Readonly<Record<StatusId, number>>;
  updatedAt: string;
};

export type Building = {
  id: EntityId;
  addressLabel: string;
  location: GeoPoint;
  geohash: string;
  zoneId: EntityId;
  createdBy: UserId;
  structureRevision: number;
};

export type Door = {
  id: EntityId;
  buildingId: EntityId;
  zoneId: EntityId;
  location: GeoPoint;
  geohash: string;
  floor: number;
  label: string;
  sortOrder: number;
  active: boolean;
  currentStatusId: StatusId;
  revision: number;
  lastVisitId: EntityId | null;
  createdBy: UserId;
};

export type Visit = {
  id: EntityId;
  doorId: EntityId;
  statusId: StatusId;
  note: string;
  authorId: UserId;
  occurredAt: string;
  syncedAt: string | null;
  doorRevision: number;
  replacesVisitId: EntityId | null;
  voidedAt: string | null;
};

export type WorkspaceSnapshot = {
  id: WorkspaceId;
  members: readonly WorkspaceMember[];
  statuses: readonly Status[];
  zones: readonly Zone[];
  zoneStats: readonly ZoneStats[];
  buildings: readonly Building[];
  doors: readonly Door[];
  visits: readonly Visit[];
};
