import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearIndexedDbOutboxForTests, IndexedDbOutbox } from '../outbox/indexeddb-outbox';
import { pendingPurge, purgeUntrustedDevice, unsyncedLocalWrites } from './device-storage';

function stubWindow(): Map<string, string> {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  });
  return values;
}

const intent = {
  commandId: 'visit-1', authorId: 'member-a', doorId: 'door-a', statusId: 'retry', note: '',
  expectedRevision: 0, createdAt: '2026-08-09T20:00:00.000Z'
};

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearIndexedDbOutboxForTests();
});

describe('untrusted device purge', () => {
  it('reports a partial purge instead of claiming success, and remembers to finish it', async () => {
    stubWindow();
    await new IndexedDbOutbox('member-a').add(intent);

    const report = await purgeUntrustedDevice('member-a', [{ step: 'cache Firestore', run: async () => false }]);

    expect(report).toEqual({ complete: false, failed: ['cache Firestore'] });
    expect(pendingPurge()).toBe('member-a');
    await expect(unsyncedLocalWrites('member-a')).resolves.toEqual({ visits: 0, profiles: 0 });
  });

  it('clears the reminder once every step succeeds', async () => {
    stubWindow();
    await purgeUntrustedDevice('member-a', [{ step: 'cache Firestore', run: async () => false }]);
    const report = await purgeUntrustedDevice('member-a', [{ step: 'cache Firestore', run: async () => true }]);
    expect(report.complete).toBe(true);
    expect(pendingPurge()).toBeNull();
  });

  it('returns an unknown count, not zero, when the local queue cannot be read', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('Internal error.'); } });
    await expect(unsyncedLocalWrites('member-a')).resolves.toBeNull();
  });
});
