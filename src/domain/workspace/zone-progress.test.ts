import { describe, expect, it } from 'vitest';
import type { ZoneStats } from './models';
import { isExcludedFromFollowUp } from './follow-up';
import { assertZoneStats, zoneDoorProgress } from './zone-progress';

const stats: ZoneStats = {
  zoneId: 'carmes', doorCount: 6, countsByStatus: { unvisited: 3, contacted: 2, retry: 1 },
  updatedAt: '2026-08-03T08:00:00.000Z'
};

describe('progression du relevé de portes', () => {
  it('compte 3/6 portes, indépendamment du nombre de bâtiments et du catalogue de libellés', () => {
    expect(zoneDoorProgress(stats, 'carmes')).toEqual({
      state: 'recorded', total: 6, visited: 3, unvisited: 3, percent: 50, updatedAt: stats.updatedAt
    });
  });

  it('distingue une projection manquante, un ensemble vide et un vrai zéro', () => {
    expect(zoneDoorProgress(null, 'carmes')).toMatchObject({ state: 'unavailable', percent: null, total: null });
    expect(zoneDoorProgress({ ...stats, doorCount: 0, countsByStatus: {} }, 'carmes')).toMatchObject({ state: 'empty', percent: null, total: 0 });
    expect(zoneDoorProgress({ ...stats, countsByStatus: { unvisited: 6 } }, 'carmes')).toMatchObject({ state: 'recorded', percent: 0, total: 6 });
  });

  it('ne complète jamais à zéro les statuts manquants quand le total est inexpliqué', () => {
    const incomplete = { ...stats, doorCount: 10, countsByStatus: { contacted: 2 } };
    expect(() => assertZoneStats(incomplete)).toThrow('do not cover');
    expect(zoneDoorProgress(incomplete, 'carmes').percent).toBeNull();
  });

  it('accepte les catégories omises seulement quand le total est entièrement expliqué', () => {
    expect(zoneDoorProgress({ ...stats, countsByStatus: { contacted: 6 } }, 'carmes')).toMatchObject({ percent: 100, unvisited: 0 });
  });

  it.each<Readonly<Record<string, number>>>([
    { unvisited: 7 },
    { todo: 6 },
    { unknown: 6 },
    { unvisited: -1, retry: 7 },
    { unvisited: 2.5, retry: 3.5 },
    { unvisited: Number.NaN },
    { unvisited: Number.POSITIVE_INFINITY }
  ])('refuse les compteurs incohérents : %j', (countsByStatus) => {
    expect(zoneDoorProgress({ ...stats, countsByStatus }, 'carmes')).toMatchObject({ state: 'unavailable', reason: 'invalid', percent: null });
  });

  it('refuse un total non sûr, une date invalide et le relevé d’une autre zone', () => {
    expect(zoneDoorProgress({ ...stats, doorCount: Number.MAX_SAFE_INTEGER + 1 }, 'carmes').percent).toBeNull();
    expect(zoneDoorProgress({ ...stats, updatedAt: 'inconnue' }, 'carmes').percent).toBeNull();
    expect(zoneDoorProgress(stats, 'autre-zone').percent).toBeNull();
  });

  it('réserve 100 % à un relevé entièrement visité et évite les erreurs d’arrondi binaire', () => {
    expect(zoneDoorProgress({ ...stats, doorCount: 1000, countsByStatus: { contacted: 999, unvisited: 1 } }, 'carmes').percent).toBe(99);
    expect(zoneDoorProgress({ ...stats, doorCount: 100, countsByStatus: { contacted: 29, unvisited: 71 } }, 'carmes').percent).toBe(29);
  });

  it('compte les passages linked et do-not-return sans réintroduire ces portes dans le suivi', () => {
    expect(zoneDoorProgress({ ...stats, countsByStatus: { linked: 3, 'do-not-return': 3 } }, 'carmes').percent).toBe(100);
    expect(isExcludedFromFollowUp('linked')).toBe(true);
    expect(isExcludedFromFollowUp('do-not-return')).toBe(true);
  });

  it('conserve la date du relevé ancien sans la remplacer par la date de lecture', () => {
    expect(zoneDoorProgress(stats, 'carmes').updatedAt).toBe('2026-08-03T08:00:00.000Z');
  });
});
