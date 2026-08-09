import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearIndexedDbOutboxForTests, clearIndexedDbOutboxForUser, IndexedDbDoorMarkerOutbox, IndexedDbOutbox } from './indexeddb-outbox';
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
  vi.unstubAllGlobals();
  await clearIndexedDbOutboxForTests();
});

describe('IndexedDbOutbox', () => {
  it('survives a new instance while preserving the UUID and revision', async () => {
    const firstSession = new IndexedDbOutbox('member-a');
    await firstSession.add(intent);

    const reloadedSession = new IndexedDbOutbox('member-a');
    await expect(reloadedSession.pending()).resolves.toEqual([expect.objectContaining(intent)]);
  });

  it('keeps visits and profiles usable in memory when IndexedDB is broken', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('Internal error.'); } });
    const outbox = new IndexedDbOutbox('member-a');
    const markers = new IndexedDbDoorMarkerOutbox('member-a');

    await expect(outbox.all()).resolves.toEqual([]);
    await outbox.add(intent);
    await markers.add({
      commandId: 'marker-a', authorId: 'member-a', doorId: 'door-a', foyer: 'couple', sisters: true,
      createdAt: '2026-08-09T20:02:00.000Z'
    });

    await expect(outbox.pending()).resolves.toMatchObject([{ commandId: intent.commandId }]);
    await expect(markers.pending()).resolves.toMatchObject([{ doorId: 'door-a', foyer: 'couple', sisters: true }]);
  });

  it('partitions entries by user and refuses an intent from another user', async () => {
    const memberA = new IndexedDbOutbox('member-a');
    const memberB = new IndexedDbOutbox('member-b');
    await memberA.add(intent);

    await expect(memberB.all()).resolves.toEqual([]);
    await expect(memberB.add(intent)).rejects.toThrow('Outbox user does not match intent author');
  });

  it('refuses to overwrite an existing UUID and orders chained revisions deterministically', async () => {
    const outbox = new IndexedDbOutbox('member-a');
    await outbox.add({ ...intent, commandId: 'visit-z', expectedRevision: 4 });
    await outbox.add({ ...intent, commandId: 'visit-a', expectedRevision: 5 });

    await expect(outbox.add({ ...intent, commandId: 'visit-z', expectedRevision: 99 })).rejects.toBeTruthy();
    await expect(outbox.pending()).resolves.toMatchObject([
      { commandId: 'visit-z', expectedRevision: 4 },
      { commandId: 'visit-a', expectedRevision: 5 }
    ]);
  });

  it('keeps dependent revisions blocked after a conflict and a reload', async () => {
    const initialDoor = { id: 'door-a', currentStatusId: 'unvisited' as const, revision: 4, lastVisitId: null, lastVisitAt: null };
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

  it('persists a rebased conflict chain and can explicitly abandon it', async () => {
    const outbox = new IndexedDbOutbox('member-a');
    await outbox.add({ ...intent, commandId: 'visit-conflict', expectedRevision: 4 });
    await outbox.add({ ...intent, commandId: 'visit-dependent', expectedRevision: 5 });
    await outbox.markConflict('visit-conflict', { id: 'door-a', currentStatusId: 'contacted', revision: 5, lastVisitId: 'remote', lastVisitAt: '2026-08-03T08:00:00.000Z' });

    await outbox.reapplyConflict('visit-conflict');
    const reloaded = new IndexedDbOutbox('member-a');
    await expect(reloaded.pending()).resolves.toMatchObject([
      { commandId: 'visit-conflict', expectedRevision: 5 },
      { commandId: 'visit-dependent', expectedRevision: 6 }
    ]);
    await reloaded.markConflict('visit-conflict', { id: 'door-a', currentStatusId: 'contacted', revision: 6, lastVisitId: 'remote-2', lastVisitAt: '2026-08-03T08:05:00.000Z' });
    await reloaded.abandonConflict('visit-conflict');
    await expect(reloaded.all()).resolves.toEqual([]);
  });

  it('purges only the signing-out user partition', async () => {
    const memberA = new IndexedDbOutbox('member-a');
    const memberB = new IndexedDbOutbox('member-b');
    await memberA.add(intent);
    await memberB.add({ ...intent, authorId: 'member-b', commandId: 'visit-member-b' });

    await clearIndexedDbOutboxForUser('member-a');
    await expect(memberA.all()).resolves.toEqual([]);
    await expect(memberB.all()).resolves.toMatchObject([{ commandId: 'visit-member-b', authorId: 'member-b' }]);
  });

  it('does not resurrect an entry when another tab purges during a state update', async () => {
    const firstTab = new IndexedDbOutbox('member-a');
    const secondTab = new IndexedDbOutbox('member-a');
    await firstTab.add(intent);

    await Promise.allSettled([
      firstTab.markConflict(intent.commandId, { id: 'door-a', currentStatusId: 'contacted', revision: 5, lastVisitId: 'remote', lastVisitAt: '2026-08-03T08:00:00.000Z' }),
      clearIndexedDbOutboxForUser('member-a')
    ]);

    await expect(secondTab.all()).resolves.toEqual([]);
  });

  it('serializes conflicting resolution commands from two tabs', async () => {
    const firstTab = new IndexedDbOutbox('member-a');
    const secondTab = new IndexedDbOutbox('member-a');
    await firstTab.add(intent);
    await firstTab.markConflict(intent.commandId, { id: 'door-a', currentStatusId: 'contacted', revision: 5, lastVisitId: 'remote', lastVisitAt: '2026-08-03T08:00:00.000Z' });

    const outcomes = await Promise.allSettled([
      firstTab.reapplyConflict(intent.commandId),
      secondTab.abandonConflict(intent.commandId)
    ]);
    const remaining = await firstTab.all();

    expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
    expect(remaining.every((entry) => entry.state === 'pending')).toBe(true);
  });
});
