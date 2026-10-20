import { expect, it } from 'vitest';
import { canUseOfflineCache } from './firestore-workspace-read-repositories';
it('uses the cache only for connectivity failures, never a denied or invalid read', () => {
  expect(canUseOfflineCache({ code: 'unavailable' })).toBe(true);
  expect(canUseOfflineCache({ code: 'deadline-exceeded' })).toBe(true);
  for (const code of ['permission-denied', 'unauthenticated', 'failed-precondition', 'invalid-argument']) expect(canUseOfflineCache({ code })).toBe(false);
});
