export type EntityId = string;
export type WorkspaceId = string;
export type UserId = string;
export type StatusId = string;
export type DoorFoyer = 'femme' | 'homme' | 'couple' | 'famille' | null;

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
  /**
   * `door.derived.dernierPassageAt` de `02-DATA-MODEL.md` : date du passage le plus récent.
   * C'est l'axe de lecture du terrain — la question utile n'est pas « quoi » mais
   * « depuis quand ». `null` tant qu'aucun passage n'a été enregistré.
   */
  lastVisitAt: string | null;
  createdBy: UserId;
  /** Composition sensible, lisible uniquement dans la fiche de cette porte. */
  foyer: DoorFoyer;
  /**
   * Marqueur « à confier aux sœurs ». Donnée sensible : elle n'apparaît jamais dans une
   * liste ni dans un export, et sur la carte seul l'anneau rose du bâtiment la trahit.
   * Cumulable avec n'importe quel statut — ce n'est pas un septième statut.
   */
  sisters: boolean;
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
