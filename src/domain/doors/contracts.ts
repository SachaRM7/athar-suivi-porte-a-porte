export type DoorStatusId = string;

export type DoorSnapshot = {
  id: string;
  currentStatusId: DoorStatusId;
  revision: number;
  lastVisitId: string | null;
};

export type VisitIntent = {
  commandId: string;
  authorId: string;
  doorId: string;
  statusId: DoorStatusId;
  note: string;
  expectedRevision: number;
  createdAt: string;
};

export type SyncState = 'pending' | 'conflict' | 'rejected';

export type RejectionCategory = 'inactive-member' | 'author-mismatch' | 'invalid-intent' | 'security';

export type OutboxEntry = VisitIntent & {
  state: SyncState;
  conflict?: DoorSnapshot;
  rejection?: RejectionCategory;
};
