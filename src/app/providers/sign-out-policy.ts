import type { UnsyncedLocalWrites } from '../../infrastructure/outbox/indexeddb-outbox';

export type SignOutPlan =
  | { action: 'warn'; visits: number | null; profiles: number | null }
  | { action: 'sign-out'; purge: boolean };

/**
 * Politique explicite de déconnexion (lot A1.4) :
 * - appareil de confiance : rien n'est effacé, la file reste rangée sous l'UID ;
 * - appareil non approuvé sans écriture en attente : purge complète ;
 * - appareil non approuvé avec écritures en attente, ou file illisible : on prévient et on
 *   n'efface qu'après confirmation explicite (`discardUnsynced`).
 */
export function planSignOut(input: {
  authorId: string | null | undefined;
  trusted: boolean;
  discardUnsynced: boolean;
  unsynced: UnsyncedLocalWrites | null;
}): SignOutPlan {
  const purge = Boolean(input.authorId) && !input.trusted;
  if (!purge || input.discardUnsynced) return { action: 'sign-out', purge };
  if (!input.unsynced) return { action: 'warn', visits: null, profiles: null };
  if (input.unsynced.visits + input.unsynced.profiles > 0) return { action: 'warn', ...input.unsynced };
  return { action: 'sign-out', purge };
}
