import type { ZoneStats } from './models';
import { isWorkspaceStatusId } from './status-ids';

/**
 * Une projection n'est exploitable que si chaque porte est expliquée par un statut connu.
 * Cela vérifie sa cohérence interne, pas sa concordance avec les visites ni sa fraîcheur.
 */
export function assertZoneStats(stats: ZoneStats): void {
  if (!Number.isSafeInteger(stats.doorCount) || stats.doorCount < 0) {
    throw new Error('Zone stats door count must be a non-negative safe integer.');
  }
  if (!stats.countsByStatus || typeof stats.countsByStatus !== 'object' || Array.isArray(stats.countsByStatus)) {
    throw new Error('Zone stats counts must be an object.');
  }
  let total = 0;
  for (const [statusId, count] of Object.entries(stats.countsByStatus)) {
    if (!isWorkspaceStatusId(statusId)) throw new Error('Zone stats contain an unknown workspace status.');
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Zone stats status count must be a non-negative safe integer.');
    total += count;
    if (!Number.isSafeInteger(total)) throw new Error('Zone stats status total is unsafe.');
  }
  if (total > stats.doorCount) throw new Error('Zone stats status counts exceed the door count.');
  if (total < stats.doorCount) throw new Error('Zone stats status counts do not cover the door count.');
  if (typeof stats.updatedAt !== 'string' || !Number.isFinite(Date.parse(stats.updatedAt))) {
    throw new Error('Zone stats update date is invalid.');
  }
}

export type ZoneDoorProgress =
  | { state: 'unavailable'; reason: 'missing' | 'invalid'; percent: null; total: null; visited: null; unvisited: null; updatedAt: null }
  | { state: 'empty'; percent: null; total: 0; visited: 0; unvisited: 0; updatedAt: string }
  | { state: 'recorded'; percent: number; total: number; visited: number; unvisited: number; updatedAt: string };

/** Progression des portes décrites dans un relevé, jamais couverture géographique de la zone. */
export function zoneDoorProgress(stats: ZoneStats | null, zoneId: string): ZoneDoorProgress {
  const unavailable = (reason: 'missing' | 'invalid'): ZoneDoorProgress => ({
    state: 'unavailable', reason, percent: null, total: null, visited: null, unvisited: null, updatedAt: null
  });
  if (!stats) return unavailable('missing');
  if (stats.zoneId !== zoneId) return unavailable('invalid');
  try {
    assertZoneStats(stats);
  } catch {
    return unavailable('invalid');
  }
  if (stats.doorCount === 0) {
    return { state: 'empty', percent: null, total: 0, visited: 0, unvisited: 0, updatedAt: stats.updatedAt };
  }
  const unvisited = stats.countsByStatus.unvisited ?? 0;
  const visited = stats.doorCount - unvisited;
  // Tronquer évite d'annoncer 100 % lorsque, par exemple, 999 portes sur 1 000 sont visitées.
  const percent = Number((BigInt(visited) * 100n) / BigInt(stats.doorCount));
  return { state: 'recorded', percent, total: stats.doorCount, visited, unvisited, updatedAt: stats.updatedAt };
}
