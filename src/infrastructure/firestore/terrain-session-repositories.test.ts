import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryOutbox } from '../../domain/sync/sync-service';
import type { WorkspaceReadRepositories } from '../../domain/workspace/repositories';
import { demoWorkspace } from '../demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../memory/workspace-repositories';
import { createTerrainSessionRepositories } from './terrain-session-repositories';

const viewport = { north: 43.62, south: 43.59, east: 1.47, west: 1.42 };
const member = demoWorkspace.members.find((entry) => entry.id === 'member-1')!;

afterEach(() => vi.unstubAllGlobals());

function setup(remote: WorkspaceReadRepositories, outbox = new MemoryOutbox()) {
  return {
    outbox,
    repositories: createTerrainSessionRepositories({
      remote,
      member,
      outbox,
      structureWriter: { apply: async () => { throw new Error('not used'); } },
      zoneWriter: { save: async () => { throw new Error('not used'); }, delete: async () => { throw new Error('not used'); } },
      buildingWriter: { create: async () => { throw new Error('not used'); } }
    })
  };
}

describe('terrain session repositories', () => {
  it('traverses an empty geohash page when it exposes a next cursor', async () => {
    const base = createMemoryWorkspaceRepositories(demoWorkspace);
    let calls = 0;
    const remote: WorkspaceReadRepositories = {
      ...base,
      buildings: {
        ...base.buildings,
        async listPageByViewport() {
          calls += 1;
          if (calls === 1) return {
            items: [], nextCursor: 'next-range',
            metrics: { documentsRead: 1, returnedCount: 0, responseBytes: 0, rangeCount: 1, duplicateCount: 0, falsePositiveCount: 1, durationMs: 1 }
          };
          return {
            items: [demoWorkspace.buildings[0]], nextCursor: null,
            metrics: { documentsRead: 1, returnedCount: 1, responseBytes: 100, rangeCount: 1, duplicateCount: 0, falsePositiveCount: 0, durationMs: 1 }
          };
        }
      }
    };

    const { repositories } = setup(remote);
    await expect(repositories.buildings.listByViewport(viewport)).resolves.toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('reconstructs the current UID projection from a pending UUID without changing the server object', async () => {
    const remote = createMemoryWorkspaceRepositories(demoWorkspace);
    const { outbox, repositories } = setup(remote);
    await outbox.add({
      commandId: 'visit-pending-uuid', authorId: member.id, doorId: 'door-dalbad-02', statusId: 'retry', note: '',
      expectedRevision: 0, createdAt: '2026-08-06T10:00:00.000Z'
    });

    const [projected] = await repositories.doors.listByBuilding('building-dalbad');
    const pendingDoor = (await repositories.doors.listByBuilding('building-dalbad')).find((door) => door.id === 'door-dalbad-02');
    const serverDoor = await remote.doors.get('door-dalbad-02');

    expect(projected).toBeDefined();
    expect(pendingDoor).toMatchObject({ currentStatusId: 'retry', revision: 1, lastVisitId: 'visit-pending-uuid' });
    expect(serverDoor).toMatchObject({ currentStatusId: 'unvisited', revision: 0, lastVisitId: null });
  });

  it('keeps server doors visible when the local outbox cannot be read', async () => {
    const remote = createMemoryWorkspaceRepositories(demoWorkspace);
    const brokenOutbox = new MemoryOutbox();
    vi.spyOn(brokenOutbox, 'all').mockRejectedValue(new Error('Internal error.'));
    const { repositories } = setup(remote, brokenOutbox);

    const doors = await repositories.doors.listByBuilding('building-dalbad');

    expect(doors).toHaveLength((await remote.doors.listByBuilding('building-dalbad')).length);
    expect(doors.map((door) => door.id)).toContain('door-dalbad-02');
  });

  it('does not expose another UID outbox and does not overwrite a newer local revision', async () => {
    const remote = createMemoryWorkspaceRepositories(demoWorkspace);
    const otherOutbox = new MemoryOutbox();
    await otherOutbox.add({
      commandId: 'visit-other-user', authorId: 'member-b', doorId: 'door-dalbad-02', statusId: 'retry', note: '',
      expectedRevision: 0, createdAt: '2026-08-06T10:00:00.000Z'
    });
    const { repositories } = setup(remote, new MemoryOutbox());
    const door = (await repositories.doors.listByBuilding('building-dalbad')).find((entry) => entry.id === 'door-dalbad-02')!;
    expect(door.currentStatusId).toBe('unvisited');

    await repositories.commitVisitAndDoor({
      id: 'visit-local-newer', doorId: door.id, statusId: 'contacted', note: '', authorId: member.id,
      occurredAt: '2026-08-06T10:01:00.000Z', syncedAt: null, doorRevision: 2, replacesVisitId: null, voidedAt: null
    }, { ...door, currentStatusId: 'contacted', revision: 2, lastVisitId: 'visit-local-newer', lastVisitAt: '2026-08-06T10:01:00.000Z' });
    await repositories.reconcileDoorSnapshot({ id: door.id, currentStatusId: 'retry', revision: 1, lastVisitId: 'visit-stale', lastVisitAt: '2026-08-06T09:00:00.000Z' });

    await expect(repositories.doors.get(door.id)).resolves.toMatchObject({
      currentStatusId: 'contacted', revision: 2, lastVisitId: 'visit-local-newer'
    });
    expect(await otherOutbox.all()).toHaveLength(1);
  });

  it('restores the targeted server door after abandoning an optimistic conflict chain', async () => {
    const remote = createMemoryWorkspaceRepositories(demoWorkspace);
    const { outbox, repositories } = setup(remote);
    await outbox.add({
      commandId: 'visit-conflict', authorId: member.id, doorId: 'door-dalbad-02', statusId: 'retry', note: '',
      expectedRevision: 0, createdAt: '2026-08-06T10:00:00.000Z'
    });
    await outbox.add({
      commandId: 'visit-dependent', authorId: member.id, doorId: 'door-dalbad-02', statusId: 'do-not-return', note: '',
      expectedRevision: 1, createdAt: '2026-08-06T10:01:00.000Z'
    });

    const optimistic = (await repositories.doors.listByBuilding('building-dalbad'))
      .find((door) => door.id === 'door-dalbad-02')!;
    expect(optimistic).toMatchObject({ currentStatusId: 'do-not-return', revision: 2, lastVisitId: 'visit-dependent' });

    const serverBase = (await remote.doors.get('door-dalbad-02'))!;
    await remote.commitVisitAndDoor({
      id: 'visit-server', doorId: serverBase.id, statusId: 'contacted', note: '', authorId: member.id,
      occurredAt: '2026-08-06T10:02:00.000Z', syncedAt: '2026-08-06T10:02:00.000Z', doorRevision: 1,
      replacesVisitId: null, voidedAt: null
    }, { ...serverBase, currentStatusId: 'contacted', revision: 1, lastVisitId: 'visit-server', lastVisitAt: '2026-08-06T10:02:00.000Z' });
    await outbox.markConflict('visit-conflict', {
      id: serverBase.id, currentStatusId: 'contacted', revision: 1, lastVisitId: 'visit-server', lastVisitAt: '2026-08-06T10:02:00.000Z'
    });

    await outbox.abandonConflict('visit-conflict');
    const refreshed = await repositories.refreshDoor(serverBase.id);

    expect(await outbox.all()).toEqual([]);
    expect(refreshed).toMatchObject({ currentStatusId: 'contacted', revision: 1, lastVisitId: 'visit-server' });
    await expect(repositories.doors.get(serverBase.id)).resolves.toMatchObject({
      currentStatusId: 'contacted', revision: 1, lastVisitId: 'visit-server'
    });
  });

  it('propagates invalid remote data instead of falling back to the demo workspace', async () => {
    const base = createMemoryWorkspaceRepositories(demoWorkspace);
    const remote: WorkspaceReadRepositories = {
      ...base,
      buildings: {
        ...base.buildings,
        async listPageByViewport() { throw new Error('Invalid Firestore building document: broken-building'); }
      }
    };
    const { repositories } = setup(remote);

    await expect(repositories.buildings.listByViewport(viewport)).rejects.toThrow('broken-building');
  });

  it('distinguishes an unprepared offline cache from an empty online response', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const base = createMemoryWorkspaceRepositories({ ...demoWorkspace, statuses: [] });
    const { repositories } = setup(base);

    await expect(repositories.statuses.list()).rejects.toThrow('Preparez cette zone');
  });
});
