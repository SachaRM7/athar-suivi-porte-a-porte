import { describe, expect, it, vi } from 'vitest';
import { MemoryOutbox } from '../../../domain/sync/sync-service';
import { LocalStorageUnavailableError } from '../../../domain/sync/outbox';
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
    await outbox.markConflict('visit-conflict', { id: 'door-dalbad-02', currentStatusId: 'contacted', revision: 1, lastVisitId: 'remote-visit', lastVisitAt: '2026-08-02T08:00:00.000Z' });

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

  it('never projects a visit as saved when the device storage refuses the intent', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const outbox = new MemoryOutbox();
    vi.spyOn(outbox, 'addMany').mockRejectedValue(new LocalStorageUnavailableError(new Error('QuotaExceededError')));

    await expect(recordLocalVisit(repositories, outbox, {
      authorId: 'member-1', doorId: 'door-dalbad-02', statusId: 'retry', note: ''
    })).rejects.toBeInstanceOf(LocalStorageUnavailableError);

    await expect(repositories.doors.get('door-dalbad-02')).resolves.toMatchObject({ currentStatusId: 'unvisited', revision: 0 });
    await expect(repositories.visits.listByDoor('door-dalbad-02')).resolves.toEqual([]);
  });

  it('projects no door of a grouped action when the grouped intent cannot be stored', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const commitVisitsAndDoors = vi.spyOn(repositories, 'commitVisitsAndDoors');
    const outbox = new MemoryOutbox();
    vi.spyOn(outbox, 'addMany').mockRejectedValue(new LocalStorageUnavailableError(new Error('AbortError')));

    await expect(recordLocalVisits(repositories, outbox, {
      authorId: 'member-1', doorIds: ['door-dalbad-02', 'door-dalbad-12'], statusId: 'retry', note: ''
    })).rejects.toBeInstanceOf(LocalStorageUnavailableError);

    expect(commitVisitsAndDoors).not.toHaveBeenCalled();
    await expect(outbox.all()).resolves.toEqual([]);
  });

  it('chains consecutive offline passages on the same door without losing the first one', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const outbox = new MemoryOutbox();
    const ids = ['visit-first', 'visit-second'];

    await recordLocalVisit(repositories, outbox, { authorId: 'member-1', doorId: 'door-dalbad-02', statusId: 'retry', note: '', createId: () => ids.shift()! });
    const second = await recordLocalVisit(repositories, outbox, { authorId: 'member-1', doorId: 'door-dalbad-02', statusId: 'contacted', note: '', createId: () => ids.shift()! });

    expect(second.door).toMatchObject({ revision: 2, currentStatusId: 'contacted', lastVisitId: 'visit-second' });
    await expect(outbox.pending()).resolves.toMatchObject([
      { commandId: 'visit-first', expectedRevision: 0 },
      { commandId: 'visit-second', expectedRevision: 1 }
    ]);
  });

  it('refuses a grouped action that would touch a « Ne pas déranger » door', async () => {
    const repositories = createMemoryWorkspaceRepositories({
      ...demoWorkspace,
      doors: demoWorkspace.doors.map((door) => door.id === 'door-dalbad-12' ? { ...door, currentStatusId: 'do-not-return', revision: 1, lastVisitId: 'v-dnd', lastVisitAt: '2026-01-01T10:00:00.000Z' } : door)
    });
    const outbox = new MemoryOutbox();

    await expect(recordLocalVisits(repositories, outbox, {
      authorId: 'member-1', doorIds: ['door-dalbad-02', 'door-dalbad-12'], statusId: 'retry', note: ''
    })).rejects.toThrow('excluded from follow-up');
    await expect(outbox.all()).resolves.toEqual([]);
    await expect(repositories.doors.get('door-dalbad-12')).resolves.toMatchObject({ currentStatusId: 'do-not-return' });
  });

  it('corrects a « Ne pas déranger » by adding a passage, never by erasing the previous one', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const outbox = new MemoryOutbox();
    const ids = ['visit-dnd', 'visit-correction'];
    await recordLocalVisit(repositories, outbox, { authorId: 'member-1', doorId: 'door-dalbad-02', statusId: 'do-not-return', note: '', now: new Date('2026-08-02T09:00:00.000Z'), createId: () => ids.shift()! });
    await recordLocalVisit(repositories, outbox, { authorId: 'member-1', doorId: 'door-dalbad-02', statusId: 'contacted', note: 'Erreur de saisie', now: new Date('2026-08-02T09:05:00.000Z'), createId: () => ids.shift()! });

    const history = await repositories.visits.listByDoor('door-dalbad-02');
    expect(history.map((visit) => visit.statusId).sort()).toEqual(['contacted', 'do-not-return']);
    await expect(repositories.doors.get('door-dalbad-02')).resolves.toMatchObject({ currentStatusId: 'contacted', revision: 2 });
  });
});

describe('outing association captured durably at recording time', () => {
  it('preserves the outing through single and grouped intentions and conflict reapplication', async () => {
    const zoneId = demoWorkspace.doors.find(door => door.id === 'door-dalbad-02')!.zoneId;
    const repositories = createMemoryWorkspaceRepositories({ ...demoWorkspace, members: demoWorkspace.members.map(member => member.id === 'member-1' ? { ...member, activeOuting: { id: 'outing-test', zoneId, title: 'Terrain' } } : member) });
    const outbox = new MemoryOutbox();
    await recordLocalVisit(repositories, outbox, { authorId: 'member-1', doorId: 'door-dalbad-02', statusId: 'retry', note: '', createId: () => 'single-outing' });
    expect((await outbox.all())[0].outingId).toBe('outing-test');
    await outbox.markConflict('single-outing', { id: 'door-dalbad-02', revision: 5, currentStatusId: 'contacted', lastVisitId: 'remote', lastVisitAt: null });
    await outbox.reapplyConflict('single-outing');
    expect((await outbox.all())[0]).toMatchObject({ outingId: 'outing-test', expectedRevision: 5, state: 'pending' });
    const other = demoWorkspace.doors.find(door => door.zoneId === zoneId && door.id !== 'door-dalbad-02' && door.active && !['linked','do-not-return'].includes(door.currentStatusId))!;
    await recordLocalVisits(repositories, outbox, { authorId: 'member-1', doorIds: [other.id], statusId: 'retry', note: '', createId: () => 'group-outing' });
    expect((await outbox.all()).find(entry => entry.commandId === 'group-outing')?.outingId).toBe('outing-test');
  });
  it('does not attach an unrelated zone or invent a sortie for historical activity', async () => {
    const repositories = createMemoryWorkspaceRepositories({ ...demoWorkspace, members: demoWorkspace.members.map(member => ({ ...member, activeOuting: { id: 'elsewhere', zoneId: 'another-zone', title: 'Elsewhere' } })) });
    const outbox = new MemoryOutbox();
    const result = await recordLocalVisit(repositories, outbox, { authorId: 'member-1', doorId: 'door-dalbad-02', statusId: 'retry', note: '' });
    expect(result.visit.outingId).toBeUndefined(); expect((await outbox.all())[0].outingId).toBeUndefined();
  });
});
