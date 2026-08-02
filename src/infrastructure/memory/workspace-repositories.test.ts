import { describe, expect, it } from 'vitest';
import { demoWorkspace } from '../demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from './workspace-repositories';

describe('memory workspace repositories', () => {
  it('exposes only active members and ordered configurable statuses', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    await expect(repositories.members.listActive()).resolves.toHaveLength(2);
    const statuses = await repositories.statuses.list();
    expect(statuses.map((status) => status.id)).toEqual(['unvisited', 'retry', 'contacted', 'do-not-return']);
  });

  it('returns only demo doors in the requested viewport without exposing mutable storage', async () => {
    const repositories = createMemoryWorkspaceRepositories(demoWorkspace);
    const visible = await repositories.doors.listByViewport({ north: 43.608, south: 43.605, east: 1.449, west: 1.444 });
    expect(visible.map((door) => door.id).sort()).toEqual(['door-carmes-11', 'door-carmes-12', 'door-dalbad-01', 'door-dalbad-02']);
    const loaded = await repositories.doors.get('door-dalbad-01');
    if (!loaded) throw new Error('Demo door missing.');
    loaded.label = 'mutated';
    await expect(repositories.doors.get('door-dalbad-01')).resolves.toMatchObject({ label: '01' });
  });
});
