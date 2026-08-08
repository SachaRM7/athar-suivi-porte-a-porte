import { describe, expect, it } from 'vitest';
import { demoWorkspace } from '../demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from './workspace-repositories';
import { encodeReadCursor } from '../../domain/workspace/read-pagination';

describe('memory workspace repositories', () => {
  it('exposes only active members and ordered configurable statuses', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    await expect(repositories.members.listActive()).resolves.toHaveLength(3);
    const statuses = await repositories.statuses.list();
    expect(statuses.map((status) => status.id)).toEqual(['unvisited', 'contacted', 'retry', 'linked', 'do-not-return', 'locked']);
  });

  it('returns only demo doors in the requested viewport without exposing mutable storage', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const visible = await repositories.doors.listByViewport({ north: 43.608, south: 43.605, east: 1.449, west: 1.444 });
    expect(visible.map((door) => door.id).sort()).toEqual(['door-carmes-11', 'door-carmes-12', 'door-dalbad-01', 'door-dalbad-02', 'door-dalbad-11', 'door-dalbad-12']);
    const loaded = await repositories.doors.get('door-dalbad-01');
    if (!loaded) throw new Error('Demo door missing.');
    loaded.label = 'mutated';
    await expect(repositories.doors.get('door-dalbad-01')).resolves.toMatchObject({ label: '01' });
  });

  it('applies a structure diff without changing an existing passage revision', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const before = await repositories.doors.get('door-dalbad-01');
    if (!before) throw new Error('Demo door missing.');

    const diff = await repositories.applyBuildingStructure({
      buildingId: 'building-dalbad',
      expectedStructureRevision: 0,
      authorId: 'admin-1',
      targets: [
        { existingDoorId: 'door-dalbad-01', floor: 0, label: '01', sortOrder: 9 },
        { existingDoorId: 'door-dalbad-02', floor: 0, label: '02', sortOrder: 10 },
        { floor: 0, label: '03', sortOrder: 11 }
      ],
      createDoorId: () => 'door-dalbad-03'
    });

    expect(diff.building.structureRevision).toBe(1);
    await expect(repositories.doors.get('door-dalbad-01')).resolves.toMatchObject({
      sortOrder: 9,
      currentStatusId: before.currentStatusId,
      revision: before.revision,
      lastVisitId: before.lastVisitId
    });
    await expect(repositories.doors.get('door-dalbad-03')).resolves.toMatchObject({
      active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null
    });
  });

  it('rejects a page cursor from another scope or an unknown document', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const firstPage = await repositories.buildings.listPageByZone('carmes', { pageSize: 1 });
    expect(firstPage.nextCursor).not.toBeNull();
    await expect(repositories.buildings.listPageByZone('other-zone', {
      cursor: firstPage.nextCursor,
      pageSize: 1
    })).rejects.toThrow('Read cursor is invalid.');
    await expect(repositories.buildings.listPageByZone('carmes', {
      cursor: encodeReadCursor('buildings:zone:carmes', { id: 'missing-building' }),
      pageSize: 1
    })).rejects.toThrow('Read cursor is invalid.');
  });

  it('persists zone properties and deletes an empty zone', async () => {
    const repositories = createMemoryWorkspaceRepositories({ ...demoWorkspace, buildings: [] });
    const zone = { ...demoWorkspace.zones[0], id: 'zone-temporary', name: 'Zone temporaire', color: '#D8A200' };
    await repositories.zones.save(zone);
    await expect(repositories.zones.list()).resolves.toContainEqual(zone);
    await repositories.zones.delete(zone.id);
    await expect(repositories.zones.list()).resolves.not.toContainEqual(zone);
  });
});
