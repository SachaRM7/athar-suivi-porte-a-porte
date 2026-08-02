import { describe, expect, it } from 'vitest';
import type { DoorSnapshot } from '../doors/contracts';
import { MemoryDoorGateway, MemoryOutbox, SyncLab } from './sync-service';

const initialDoor: DoorSnapshot = {
  id: 'door-a',
  currentStatusId: 'unvisited',
  revision: 4,
  lastVisitId: null
};

describe('offline synchronization prototype', () => {
  it('keeps a write locally while offline then synchronizes it', async () => {
    const gateway = new MemoryDoorGateway([initialDoor]);
    const outbox = new MemoryOutbox();
    const lab = new SyncLab(
      gateway,
      outbox,
      'member-a',
      () => new Date('2026-07-29T12:00:00Z'),
      () => 'visit-offline'
    );

    gateway.setOnline(false);
    await lab.queueStatus(initialDoor, 'retry', 'Repasser en soiree');
    await lab.flush();
    expect(await outbox.pending()).toHaveLength(1);
    expect(gateway.read('door-a').revision).toBe(4);

    gateway.setOnline(true);
    await lab.flush();
    expect(await outbox.all()).toHaveLength(0);
    expect(gateway.read('door-a')).toMatchObject({
      currentStatusId: 'retry',
      revision: 5,
      lastVisitId: 'visit-offline'
    });
  });

  it('retains a stale offline write as a visible conflict', async () => {
    const gateway = new MemoryDoorGateway([initialDoor]);
    const firstOutbox = new MemoryOutbox();
    const secondOutbox = new MemoryOutbox();
    const first = new SyncLab(gateway, firstOutbox, 'member-a', undefined, () => 'visit-first');
    const second = new SyncLab(gateway, secondOutbox, 'member-b', undefined, () => 'visit-second');

    await first.queueStatus(initialDoor, 'contacted');
    await second.queueStatus(initialDoor, 'do-not-return');
    await first.flush();
    await second.flush();

    expect(gateway.read('door-a')).toMatchObject({ currentStatusId: 'contacted', revision: 5 });
    expect(await secondOutbox.all()).toMatchObject([
      {
        state: 'conflict',
        expectedRevision: 4,
        conflict: { currentStatusId: 'contacted', revision: 5 }
      }
    ]);
  });

  it('chains multiple offline writes from one device without self-conflict', async () => {
    const gateway = new MemoryDoorGateway([initialDoor]);
    const outbox = new MemoryOutbox();
    const ids = ['visit-local-1', 'visit-local-2'];
    const lab = new SyncLab(gateway, outbox, 'member-a', undefined, () => ids.shift()!);

    gateway.setOnline(false);
    await lab.queueStatus(initialDoor, 'retry');
    await lab.queueStatus(initialDoor, 'contacted');
    expect((await outbox.pending()).map((entry) => entry.expectedRevision)).toEqual([4, 5]);

    gateway.setOnline(true);
    await lab.flush();
    expect(await outbox.all()).toHaveLength(0);
    expect(gateway.read('door-a')).toMatchObject({ currentStatusId: 'contacted', revision: 6 });
  });

  it('blocks dependent writes after the first write conflicts', async () => {
    const gateway = new MemoryDoorGateway([initialDoor]);
    const outbox = new MemoryOutbox();
    const ids = ['visit-local-1', 'visit-local-2'];
    const lab = new SyncLab(gateway, outbox, 'member-a', undefined, () => ids.shift()!);

    await lab.queueStatus(initialDoor, 'retry');
    await lab.queueStatus(initialDoor, 'contacted');
    await gateway.commit({
      commandId: 'visit-remote',
      authorId: 'member-b',
      doorId: 'door-a',
      statusId: 'do-not-return',
      note: '',
      expectedRevision: 4,
      createdAt: '2026-07-29T12:01:00.000Z'
    });
    await lab.flush();

    expect(gateway.read('door-a')).toMatchObject({ currentStatusId: 'do-not-return', revision: 5 });
    expect((await outbox.all()).map((entry) => entry.state)).toEqual(['conflict', 'pending']);
  });
});
