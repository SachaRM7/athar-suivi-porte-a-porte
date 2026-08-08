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

/**
 * Mutation dédiée au marqueur « à confier aux sœurs ».
 *
 * Volontairement séparée de `VisitIntent` : un marqueur n'est pas un passage. Il ne fait
 * pas avancer la révision de la porte, il n'entre pas dans la chaîne de conflits, et il
 * n'écrit jamais dans `passages`. Deux basculements sur la même porte se remplacent —
 * un booléen n'a pas d'historique à préserver.
 */
export type DoorMarkerIntent = {
  commandId: string;
  authorId: string;
  doorId: string;
  sisters: boolean;
  createdAt: string;
};

export type SyncState = 'pending' | 'conflict' | 'rejected';

export type RejectionCategory = 'inactive-member' | 'author-mismatch' | 'invalid-intent' | 'security';

export type OutboxEntry = VisitIntent & {
  state: SyncState;
  conflict?: DoorSnapshot;
  rejection?: RejectionCategory;
};
