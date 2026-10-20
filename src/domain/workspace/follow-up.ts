import type { Door } from './models';

/**
 * Cycle de suivi d'une porte — règle métier unique du lot A2.
 *
 * Trois notions distinctes, à ne jamais confondre :
 * 1. le **résultat du dernier passage** (`currentStatusId`), un fait historique ;
 * 2. l'**éligibilité à une suggestion** (première visite ou revisite) ;
 * 3. l'**exclusion du suivi ordinaire**.
 *
 * Deux résultats sortent une porte du suivi ordinaire :
 * - « Attaché à l'effort » (`linked`) : le lien est fait, il n'y a plus à frapper ;
 * - « Ne pas déranger » (`do-not-return`) : la personne a demandé à ne plus être sollicitée.
 *
 * « Absent » et « Accès bloqué » restent dans le cycle : une absence ou un digicode ne sont
 * jamais définitifs. Aucune donnée n'est stockée pour cela : tout se dérive du statut courant,
 * et l'historique des passages n'est jamais modifié. Un écran qui propose une visite, ou une
 * action groupée qui écrit des passages, passe par ces fonctions — jamais par sa propre liste.
 */
export const FOLLOW_UP_EXCLUDED_STATUS_IDS: readonly string[] = Object.freeze(['linked', 'do-not-return']);

/** Statut à corriger seulement par une opération explicite et confirmée. */
export const DO_NOT_DISTURB_STATUS_ID = 'do-not-return';

export const UNVISITED_STATUS_ID = 'unvisited';

export type DoorFollowUp =
  /** Porte archivée : hors parcours terrain. */
  | 'inactive'
  /** Jamais visitée : à faire. */
  | 'first-visit'
  /** Visitée, toujours dans le cycle : peut être proposée pour un nouveau passage. */
  | 'revisit'
  /** Sortie du suivi ordinaire : aucune suggestion, aucune action groupée. */
  | 'excluded';

type FollowUpDoor = Pick<Door, 'active' | 'currentStatusId'>;

export function isExcludedFromFollowUp(statusId: string): boolean {
  return FOLLOW_UP_EXCLUDED_STATUS_IDS.includes(statusId);
}

export function doorFollowUp(door: FollowUpDoor): DoorFollowUp {
  if (!door.active) return 'inactive';
  if (isExcludedFromFollowUp(door.currentStatusId)) return 'excluded';
  if (door.currentStatusId === UNVISITED_STATUS_ID) return 'first-visit';
  return 'revisit';
}

/**
 * Portes qu'une action groupée (« tout marquer absent ») a le droit d'écrire : seulement
 * celles jamais visitées. Une porte sortie du suivi n'est jamais touchée par un geste
 * collectif, et une porte déjà visitée ne reçoit pas un « Absent » qu'on n'a pas constaté.
 */
export function doorsForGroupedAbsence<T extends FollowUpDoor>(doors: readonly T[]): T[] {
  return doors.filter((door) => doorFollowUp(door) === 'first-visit');
}

/**
 * Changer le résultat d'une porte « Ne pas déranger » est une correction : elle exige une
 * confirmation explicite. Elle ajoute un passage ; l'ancien reste dans l'historique.
 */
export function requiresDoNotDisturbConfirmation(door: Pick<Door, 'currentStatusId'>, nextStatusId: string): boolean {
  return door.currentStatusId === DO_NOT_DISTURB_STATUS_ID && nextStatusId !== DO_NOT_DISTURB_STATUS_ID;
}
