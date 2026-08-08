import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryDoorMarkerOutbox, flushDoorMarkers } from '../../../domain/sync/door-marker-outbox';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../../../infrastructure/memory/workspace-repositories';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { markDoorForSisters } from './mark-door-for-sisters';
import { recordLocalVisit } from './record-local-visit';
import { MemoryOutbox } from '../../../domain/sync/sync-service';

let repositories: WorkspaceRepositories;
let markers: MemoryDoorMarkerOutbox;

beforeEach(() => {
  repositories = createMemoryWorkspaceRepositories(demoWorkspace);
  markers = new MemoryDoorMarkerOutbox();
});

describe('markDoorForSisters', () => {
  it('records the marker without touching the revision chain or the status', async () => {
    const before = await repositories.doors.get('door-dalbad-01');
    const door = await markDoorForSisters(repositories, markers, { doorId: 'door-dalbad-01', sisters: true, authorId: 'member-1' });

    expect(door.sisters).toBe(true);
    expect(door.revision).toBe(before?.revision);
    expect(door.currentStatusId).toBe(before?.currentStatusId);
    expect(door.lastVisitId).toBe(before?.lastVisitId);
  });

  it('never creates a passage', async () => {
    const before = await repositories.visits.listByDoor('door-dalbad-01');
    await markDoorForSisters(repositories, markers, { doorId: 'door-dalbad-01', sisters: true, authorId: 'member-1' });
    expect(await repositories.visits.listByDoor('door-dalbad-01')).toHaveLength(before.length);
  });

  it('queues one intent per door, the last toggle winning', async () => {
    await markDoorForSisters(repositories, markers, { doorId: 'door-dalbad-01', sisters: true, authorId: 'member-1' });
    await markDoorForSisters(repositories, markers, { doorId: 'door-dalbad-01', sisters: false, authorId: 'member-1' });

    const pending = await markers.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.sisters).toBe(false);
  });

  it('leaves the visit outbox alone, so a marker never blocks a passage', async () => {
    const outbox = new MemoryOutbox();
    await markDoorForSisters(repositories, markers, { doorId: 'door-dalbad-02', sisters: true, authorId: 'member-1' });
    expect(await outbox.all()).toHaveLength(0);

    await recordLocalVisit(repositories, outbox, { doorId: 'door-dalbad-02', statusId: 'retry', note: '', authorId: 'member-1' });
    const door = await repositories.doors.get('door-dalbad-02');
    expect(door?.sisters).toBe(true);
    expect(door?.currentStatusId).toBe('retry');
  });

  it('refuses an archived door and an inactive author', async () => {
    await expect(markDoorForSisters(repositories, markers, { doorId: 'door-dalbad-01', sisters: true, authorId: 'former-member' }))
      .rejects.toThrow(/active member/);
    await expect(markDoorForSisters(repositories, markers, { doorId: 'unknown-door', sisters: true, authorId: 'member-1' }))
      .rejects.toThrow(/Door not found/);
  });
});

describe('flushDoorMarkers', () => {
  it('clears an intent once the writer accepted it', async () => {
    await markDoorForSisters(repositories, markers, { doorId: 'door-dalbad-01', sisters: true, authorId: 'member-1' });
    const written: string[] = [];
    const result = await flushDoorMarkers(markers, { apply: async (intent) => { written.push(intent.doorId); } });

    expect(written).toEqual(['door-dalbad-01']);
    expect(result.synced).toEqual(['door-dalbad-01']);
    expect(await markers.pending()).toHaveLength(0);
  });

  it('keeps a refused intent queued instead of losing the marker', async () => {
    await markDoorForSisters(repositories, markers, { doorId: 'door-dalbad-01', sisters: true, authorId: 'member-1' });
    const result = await flushDoorMarkers(markers, { apply: async () => { throw new Error('permission-denied'); } });

    expect(result.failed).toEqual([{ doorId: 'door-dalbad-01', reason: 'permission-denied' }]);
    expect(await markers.pending()).toHaveLength(1);
  });
});
