import { describe, expect, it } from 'vitest';
import type { Door } from '../../../domain/workspace/models';
import { elapsedLabel, terrainSession } from './terrain-session';

const NOW = new Date('2026-08-11T18:00:00.000Z');

function door(overrides: Partial<Door> & Pick<Door, 'id'>): Door {
  return {
    buildingId: 'building-1',
    zoneId: 'zone-1',
    location: { latitude: 43.6, longitude: 1.44 },
    geohash: 'sp2j0',
    floor: 0,
    label: '01',
    sortOrder: 0,
    active: true,
    currentStatusId: 'unvisited',
    revision: 0,
    lastVisitId: null,
    lastVisitAt: null,
    createdBy: 'member-1',
    foyer: null,
    sisters: false,
    ...overrides
  };
}

describe('terrain session', () => {
  it('reads the day from the doors themselves, in the order they were marked', () => {
    const session = terrainSession([
      door({ id: 'd2', currentStatusId: 'retry', lastVisitAt: '2026-08-11T15:10:00.000Z' }),
      door({ id: 'd1', currentStatusId: 'contacted', lastVisitAt: '2026-08-11T15:00:00.000Z' }),
      door({ id: 'd3', currentStatusId: 'linked', lastVisitAt: '2026-08-11T15:20:00.000Z' })
    ], NOW);

    expect(session.trace).toEqual(['open', 'away', 'linked']);
    expect(session.markedCount).toBe(3);
    expect(session.durationLabel).toBe('20 min');
  });

  it('ignores yesterday and doors that were never marked', () => {
    const session = terrainSession([
      door({ id: 'd1', currentStatusId: 'contacted', lastVisitAt: '2026-08-10T15:00:00.000Z' }),
      door({ id: 'd2' }),
      door({ id: 'd3', currentStatusId: 'unvisited', lastVisitAt: '2026-08-11T15:00:00.000Z' })
    ], NOW);

    expect(session).toEqual({ trace: [], markedCount: 0, durationLabel: null });
  });

  it('marks a pause when more than twenty minutes separate two doors', () => {
    const session = terrainSession([
      door({ id: 'd1', currentStatusId: 'contacted', lastVisitAt: '2026-08-11T14:00:00.000Z' }),
      door({ id: 'd2', currentStatusId: 'locked', lastVisitAt: '2026-08-11T15:05:00.000Z' })
    ], NOW);

    expect(session.trace).toEqual(['open', 'pause', 'locked']);
    expect(session.durationLabel).toBe('1 h 05');
  });

  it('formats an elapsed span the way the panel reads it', () => {
    expect(elapsedLabel(30_000)).toBe('à l’instant');
    expect(elapsedLabel(25 * 60_000)).toBe('25 min');
    expect(elapsedLabel(65 * 60_000)).toBe('1 h 05');
    expect(elapsedLabel(180 * 60_000)).toBe('3 h 00');
  });
});
