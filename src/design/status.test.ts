import { describe, expect, it } from 'vitest';
import { DOOR_STATUSES, STATUS_LABEL, TRACE_FALLBACK_HEIGHT, statusColorVar, traceHeight } from './status';

describe('vocabulaire des statuts', () => {
  it('expose exactement les six statuts figés', () => {
    expect(DOOR_STATUSES).toEqual(['todo', 'open', 'away', 'linked', 'dnd', 'locked']);
  });

  it('reprend les libellés d’AGENTS.md sans les reformuler', () => {
    expect(STATUS_LABEL).toEqual({
      todo: 'Pas encore fait',
      open: 'Contact établi',
      away: 'Absent',
      linked: "Attaché à l'effort",
      dnd: 'Ne pas déranger',
      locked: 'Accès bloqué',
    });
  });

  it('ne nomme jamais le refus — la personne a demandé la paix', () => {
    expect(Object.values(STATUS_LABEL)).not.toContain('Refus');
  });

  it('lit la couleur depuis le jeton, jamais en dur', () => {
    expect(statusColorVar('open')).toBe('var(--st-open)');
    expect(DOOR_STATUSES.map(statusColorVar).every((value) => value.startsWith('var(--st-'))).toBe(true);
  });
});

describe('hauteurs de la barre de trace', () => {
  it('suit les hauteurs de 01-DESIGN-SYSTEM.md', () => {
    expect(traceHeight('linked')).toBe(26);
    expect(traceHeight('open')).toBe(21);
    expect(traceHeight('away')).toBe(13);
    expect(traceHeight('locked')).toBe(11);
    expect(traceHeight('dnd')).toBe(10);
  });

  it('range « attaché à l’effort » au-dessus de tous les autres résultats', () => {
    const others = DOOR_STATUSES.filter((status) => status !== 'linked' && status !== 'todo');
    expect(others.every((status) => traceHeight(status) < traceHeight('linked'))).toBe(true);
  });

  it('retombe sur la valeur n-a pour une porte pas encore faite', () => {
    expect(traceHeight('todo')).toBe(TRACE_FALLBACK_HEIGHT);
  });
});
