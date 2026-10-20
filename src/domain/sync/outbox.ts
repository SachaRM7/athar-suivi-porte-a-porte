import type { DoorSnapshot, OutboxEntry, RejectionCategory, VisitIntent } from '../doors/contracts';

export interface Outbox {
  add(intent: VisitIntent): Promise<void>;
  /**
   * Ajoute plusieurs intentions en une seule transaction : toutes sont durables, ou aucune.
   * Une action groupée ne doit jamais laisser la moitié de ses passages derrière elle.
   */
  addMany(intents: readonly VisitIntent[]): Promise<void>;
  pending(): Promise<OutboxEntry[]>;
  all(): Promise<OutboxEntry[]>;
  markSynced(commandId: string): Promise<void>;
  markConflict(commandId: string, serverDoor: DoorSnapshot): Promise<void>;
  markRejected(commandId: string, category: RejectionCategory): Promise<void>;
  reapplyConflict(commandId: string): Promise<void>;
  abandonConflict(commandId: string): Promise<void>;
}

/**
 * Le stockage local de l'appareil (IndexedDB) a refusé une lecture ou une écriture.
 *
 * Cette erreur n'est jamais « absorbée » par un repli en mémoire : une donnée métier qui
 * n'a été ni confirmée par le serveur ni écrite durablement sur l'appareil n'est pas
 * sauvegardée, et l'interface doit le dire.
 */
export class LocalStorageUnavailableError extends Error {
  constructor(readonly reason: unknown, message = 'Le stockage local de cet appareil est indisponible.') {
    super(message);
    this.name = 'LocalStorageUnavailableError';
  }
}

export function isLocalStorageUnavailable(error: unknown): error is LocalStorageUnavailableError {
  return error instanceof LocalStorageUnavailableError;
}
