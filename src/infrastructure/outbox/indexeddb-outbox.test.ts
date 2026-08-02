import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearIndexedDbOutboxForTests, IndexedDbOutbox } from './indexeddb-outbox';
import { MemoryDoorGateway, SyncLab } from '../../domain/sync/sync-service';

const intent = {
  commandId: 'visit-uuid-1',
  authorId: 'member-a',
  doorId: 'door-a',
  statusId: 'retry' as const,
  note: 'Repasser',
  expectedRevision: 4,
  createdAt: '2026-07-29T12:00:00.000Z'
};

afterEach(async () => {
  await clearIndexedDbOutboxForTests();
});

describe('IndexedDbOutbox', () => {
  it('survives a new instance while preserving the UUID and revision', async () => {
    const firstSession = new IndexedDbOutbox('member-a');
    await firstSession.add(intent);

    const reloadedSession = new IndexedDbOutbox('member-a');
    await expect(reloadedSession.pending()).resolves.toEqual([expect.objectContaining(intent)]);
  });

  it('partitions entries by user and refuses an intent from another user', async () => {
    const memberA = new IndexedDbOutbox('member-a');
    const memberB = new IndexedDbOutbox('member-b');
    await memberA.add(intent);

    await expect(memberB.all()).resolves.toEqual([]);
    await expect(memberB.add(intent)).rejects.toThrow('Outbox user does not match intent author');
  });

  it('keeps dependent revisions blocked after a conflict and a reload', async () => {
    const initialDoor = { id: 'door-a', currentStatusId: 'unvisited' as const, revision: 4, lastVisitId: null };
    const gateway = new MemoryDoorGateway([initialDoor]);
    const firstSession = new IndexedDbOutbox('member-a');
    const ids = ['visit-local-1', 'visit-local-2'];
    const lab = new SyncLab(gateway, firstSession, 'member-a', undefined, () => ids.shift()!);
    await lab.queueStatus(initialDoor, 'retry');
    await lab.queueStatus(initialDoor, 'contacted');
    await gateway.commit({ ...intent, commandId: 'visit-remote', authorId: 'member-b', statusId: 'do-not-return' });
    await lab.flush();

    const reloadedOutbox = new IndexedDbOutbox('member-a');
    expect((await reloadedOutbox.all()).map((entry) => entry.state)).toEqual(['conflict', 'pending']);
    await new SyncLab(gateway, reloadedOutbox, 'member-a').flush();
    expect((await reloadedOutbox.all()).map((entry) => entry.state)).toEqual(['conflict', 'pending']);
    expect(gateway.read('door-a')).toMatchObject({ revision: 5, currentStatusId: 'do-not-return' });
  });
});
