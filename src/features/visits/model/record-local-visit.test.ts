import { describe, expect, it, vi } from 'vitest';
import { MemoryOutbox } from '../../../domain/sync/sync-service';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../../../infrastructure/memory/workspace-repositories';
import { recordLocalVisit, recordLocalVisits } from './record-local-visit';

describe('local field visit recording', () => {
  it('creates one local visit, advances the door revision and keeps the outbox intent', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const outbox = new MemoryOutbox();

    const result = await recordLocalVisit(repositories, outbox, {
      authorId: 'member-1',
      doorId: 'door-dalbad-02',
      statusId: 'retry',
      note: '  Repasser   demain soir. ',
      now: new Date('2026-08-02T09:30:00.000Z'),
      createId: () => 'visit-local-01'
    });

    expect(result.door).toMatchObject({ id: 'door-dalbad-02', currentStatusId: 'retry', revision: 1, lastVisitId: 'visit-local-01' });
    await expect(repositories.doors.get('door-dalbad-02')).resolves.toMatchObject({ currentStatusId: 'retry', revision: 1 });
    await expect(repositories.visits.listByDoor('door-dalbad-02')).resolves.toMatchObject([
      { id: 'visit-local-01', authorId: 'member-1', doorRevision: 1, note: 'Repasser demain soir.', syncedAt: null }
    ]);
    await expect(outbox.all()).resolves.toMatchObject([
      { commandId: 'visit-local-01', authorId: 'member-1', doorId: 'door-dalbad-02', expectedRevision: 0, state: 'pending' }
    ]);
  });

  it('rejects inactive members and inactive statuses before writing locally', async () => {
    const repositories = createMemoryWorkspaceRepositories({
      ...demoWorkspace,
      statuses: demoWorkspace.statuses.map((status) => status.id === 'retry' ? { ...status, active: false } : status)
    });
    const outbox = new MemoryOutbox();

    await expect(recordLocalVisit(repositories, outbox, {
      authorId: 'former-member',
      doorId: 'door-dalbad-02',
      statusId: 'contacted',
      note: ''
    })).rejects.toThrow('Visit author must be an active member.');

    await expect(recordLocalVisit(repositories, outbox, {
      authorId: 'member-1',
      doorId: 'door-dalbad-02',
      statusId: 'retry',
      note: ''
    })).rejects.toThrow('Visit status must be active.');
    await expect(outbox.all()).resolves.toEqual([]);
  });

  it('blocks a dependent local visit when the same door already carries a conflict', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const outbox = new MemoryOutbox();
    await outbox.add({
      commandId: 'visit-conflict',
      authorId: 'member-1',
      doorId: 'door-dalbad-02',
      statusId: 'retry',
      note: '',
      expectedRevision: 0,
      createdAt: '2026-08-02T09:00:00.000Z'
    });
    await outbox.markConflict('visit-conflict', { id: 'door-dalbad-02', currentStatusId: 'contacted', revision: 1, lastVisitId: 'remote-visit' });

    await expect(recordLocalVisit(repositories, outbox, {
      authorId: 'member-1',
      doorId: 'door-dalbad-02',
      statusId: 'contacted',
      note: ''
    })).rejects.toThrow('Resolve the existing door conflict before adding another visit.');
  });

  it('refuses to create a fresh intent for a door already observed as archived', async () => {
    const repositories = createMemoryWorkspaceRepositories({
      ...demoWorkspace,
      doors: demoWorkspace.doors.map((door) => door.id === 'door-dalbad-02' ? { ...door, active: false } : door)
    });
    const outbox = new MemoryOutbox();

    await expect(recordLocalVisit(repositories, outbox, {
      authorId: 'member-1',
      doorId: 'door-dalbad-02',
      statusId: 'retry',
      note: ''
    })).rejects.toThrow('Cannot record a visit for an archived door.');
    await expect(outbox.all()).resolves.toEqual([]);
  });

  it('records every unfinished door of a floor through one grouped repository write', async () => {
    const base = createMemoryWorkspaceRepositories(demoWorkspace);
    const commitVisitsAndDoors = vi.spyOn(base, 'commitVisitsAndDoors');
    const outbox = new MemoryOutbox();

    const results = await recordLocalVisits(base, outbox, {
      authorId: 'member-1',
      doorIds: ['door-dalbad-02', 'door-dalbad-12'],
      statusId: 'retry', note: '',
      now: new Date('2026-08-08T09:30:00.000Z'),
      createId: (() => { let index = 0; return () => `visit-away-${++index}`; })()
    });

    expect(commitVisitsAndDoors).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.visit.doorId)).toEqual(['door-dalbad-02', 'door-dalbad-12']);
    await expect(base.visits.listByDoor('door-dalbad-02')).resolves.toMatchObject([{ statusId: 'retry' }]);
    await expect(outbox.all()).resolves.toHaveLength(2);
  });
});
