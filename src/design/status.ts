/**
 * Vocabulaire figé des statuts — AGENTS.md et docs/athar/00-BRIEF.md.
 *
 * Les libellés sont ceux affichés à l'utilisateur : ne pas les reformuler,
 * ne pas les traduire, ne pas les abréger.
 *
 * « À confier aux sœurs » n'est pas ici : c'est un marqueur booléen séparé,
 * cumulable avec n'importe quel statut, et jamais un septième statut.
 */

export const DOOR_STATUSES = ['todo', 'open', 'away', 'linked', 'dnd', 'locked'] as const;

export type DoorStatus = (typeof DOOR_STATUSES)[number];

export const STATUS_LABEL: Readonly<Record<DoorStatus, string>> = {
  todo: 'Pas encore fait',
  open: 'Contact établi',
  away: 'Absent',
  linked: "Attaché à l'effort",
  dnd: 'Ne pas déranger',
  locked: 'Accès bloqué',
};

/** Variable CSS portant la couleur du statut. La couleur ne sert jamais à autre chose. */
export function statusColorVar(status: DoorStatus): string {
  return `var(--st-${status})`;
}

/**
 * Hauteur du trait dans la barre de trace, en pixels.
 * 01-DESIGN-SYSTEM.md : linked 26 · open 21 · again/n-a 17 · away 13 · locked 11 · dnd 10.
 *
 * `todo` ne peut pas apparaître dans une trace — une porte pas encore faite n'a pas
 * été marquée pendant la sortie — et retombe donc sur la valeur « n-a » de 17.
 */
export const TRACE_FALLBACK_HEIGHT = 17;

const TRACE_HEIGHT: Readonly<Partial<Record<DoorStatus, number>>> = {
  linked: 26,
  open: 21,
  away: 13,
  locked: 11,
  dnd: 10,
};

export function traceHeight(status: DoorStatus): number {
  return TRACE_HEIGHT[status] ?? TRACE_FALLBACK_HEIGHT;
}
