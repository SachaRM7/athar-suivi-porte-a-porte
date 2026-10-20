import type { OutboxEntry } from '../../../domain/doors/contracts';
import type { SyncDeferralReason } from '../../../domain/sync/sync-service';

/**
 * Les cinq états qu'un frère doit pouvoir distinguer d'un coup d'œil (lot A1.3).
 *
 * - `synced` : tout ce qui a été saisi est confirmé par le serveur ;
 * - `pending` : enregistré durablement sur l'appareil, envoi en attente ;
 * - `deferred` : envoi temporairement impossible (réseau, session, serveur) ;
 * - `attention` : conflit ou rejet, une décision humaine est nécessaire ;
 * - `storage-error` : le stockage local ne répond pas — rien de neuf n'est sauvegardé.
 *
 * Aucun UUID, aucune révision : ce sont des détails internes.
 */
export type FieldSyncPhase = 'synced' | 'pending' | 'deferred' | 'attention' | 'storage-error';

export type FieldSyncSummary = {
  phase: FieldSyncPhase;
  label: string;
  detail: string | null;
};

export type FieldSyncInput = {
  online: boolean;
  /** `null` quand la file locale n'a pas pu être lue. */
  entries: readonly OutboxEntry[] | null;
  pendingProfiles: number;
  deferral: SyncDeferralReason | null;
  /** Dernier échec de synchronisation non classé (réponse inattendue du serveur). */
  failure: string | null;
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function summarizeFieldSync(input: FieldSyncInput): FieldSyncSummary {
  if (input.entries === null) {
    return {
      phase: 'storage-error',
      label: 'Stockage de l’appareil indisponible',
      detail: 'Les nouvelles saisies ne peuvent pas être sauvegardées sur ce téléphone. Libère de l’espace ou recharge Athar, puis réessaie. Ce qui était déjà enregistré n’est pas effacé.'
    };
  }
  const blocked = input.entries.filter((entry) => entry.state !== 'pending');
  if (blocked.length > 0) {
    return {
      phase: 'attention',
      label: blocked.some((entry) => entry.state === 'conflict') ? 'Conflit à résoudre' : 'Passage refusé par le serveur',
      detail: 'Ouvre la porte concernée pour décider. Le passage reste sur l’appareil tant que rien n’est décidé.'
    };
  }
  const waiting = input.entries.length + input.pendingProfiles;
  if (waiting === 0) {
    return input.online
      ? { phase: 'synced', label: 'À jour', detail: null }
      : { phase: 'synced', label: 'Hors ligne', detail: 'Aucune saisie en attente sur cet appareil.' };
  }
  const what = plural(waiting, 'modification enregistrée sur l’appareil', 'modifications enregistrées sur l’appareil');
  if (!input.online || input.deferral === 'offline') {
    return { phase: 'deferred', label: 'Hors ligne', detail: `${what}, envoi au retour du réseau.` };
  }
  if (input.deferral === 'session') {
    return { phase: 'deferred', label: 'Reconnexion nécessaire', detail: `${what}. Reconnecte-toi pour les envoyer.` };
  }
  if (input.deferral === 'server' || input.failure) {
    return { phase: 'deferred', label: 'Synchronisation impossible pour le moment', detail: `${what}. Nouvel essai automatique ; tu peux aussi toucher « Synchroniser ».` };
  }
  return { phase: 'pending', label: `${plural(waiting, 'changement', 'changements')} en attente`, detail: `${what}, envoi en cours.` };
}

/** Message d'une saisie refusée localement, en français et sans détail interne. */
export function localWriteErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'LocalStorageUnavailableError') {
    return 'Rien n’a été enregistré : le stockage de ce téléphone est indisponible (espace plein ou navigation privée). Libère de l’espace puis touche à nouveau le statut.';
  }
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Resolve the existing door conflict')) return 'Cette porte a un conflit à résoudre avant un nouveau passage.';
  if (message.includes('active member')) return 'Ce compte n’est plus actif : le passage n’a pas été enregistré.';
  if (message.includes('status must be active')) return 'Ce statut n’est plus disponible : choisis-en un autre.';
  if (message.includes('archived door')) return 'Cette porte a été retirée du bâtiment : le passage n’a pas été enregistré.';
  if (message.includes('Door not found')) return 'Cette porte est introuvable : recharge le bâtiment.';
  return 'Le passage n’a pas été enregistré. Réessaie.';
}
