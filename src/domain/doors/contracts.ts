export type DoorStatusId = string;
export type DoorFoyer = 'femme' | 'homme' | 'couple' | 'famille' | null;

export type DoorSnapshot = {
  id: string;
  currentStatusId: DoorStatusId;
  revision: number;
  lastVisitId: string | null;
  /** Date du passage le plus récent, pour que l'ancienneté survive à une réconciliation. */
  lastVisitAt: string | null;
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
 * Mutation dédiée au profil sensible de la porte.
 *
 * Volontairement séparée de `VisitIntent` : ce profil n'est pas un passage. Il ne fait
 * pas avancer la révision de la porte, il n'entre pas dans la chaîne de conflits, et il
 * n'écrit jamais dans `passages`. Deux basculements sur la même porte se remplacent —
 * un booléen n'a pas d'historique à préserver.
 */
export type DoorMarkerIntent = {
  commandId: string;
  authorId: string;
  doorId: string;
  sisters: boolean;
  /** Le profil sensible voyage en une seule intention : la dernière modification gagne. */
  foyer: DoorFoyer;
  createdAt: string;
};

export type SyncState = 'pending' | 'conflict' | 'rejected';

export type RejectionCategory = 'inactive-member' | 'author-mismatch' | 'invalid-intent' | 'security';

export type OutboxEntry = VisitIntent & {
  state: SyncState;
  conflict?: DoorSnapshot;
  rejection?: RejectionCategory;
};
