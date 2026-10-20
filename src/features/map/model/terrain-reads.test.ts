import { describe, expect, it, vi } from 'vitest';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../../../infrastructure/memory/workspace-repositories';
import { loadBuildingDoors, loadTerrainPage } from './terrain-reads';

const fixture = () => createMemoryWorkspaceRepositories({ ...demoWorkspace,
  buildings: Array.from({ length: 301 }, (_, index) => ({ ...demoWorkspace.buildings[0], id: `b-${String(index).padStart(3, '0')}` })),
  doors: Array.from({ length: 301 }, (_, index) => ({ ...demoWorkspace.doors[0], id: `d-${index}`, buildingId: `b-${String(index).padStart(3, '0')}` }))
});
describe('bounded terrain reads', () => {
  it('visits 301 buildings without reading the full zone and limits door concurrency to four', async () => {
    const repositories = fixture();
    const full = vi.spyOn(repositories.buildings, 'listByZone');
    const original = repositories.doors.listPageByBuilding;
    let active = 0; let peak = 0;
    vi.spyOn(repositories.doors, 'listPageByBuilding').mockImplementation(async (...args) => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 1));
      const result = await original(...args); active--; return result;
    });
    let cursor: string | null = null; const ids = new Set<string>(); let pages = 0;
    do {
      const page = await loadTerrainPage(repositories, demoWorkspace.buildings[0].zoneId!, { cursor, signal: new AbortController().signal });
      expect(page.buildings.length).toBeLessThanOrEqual(25); expect(page.doors).toHaveLength(page.buildings.length);
      page.buildings.forEach(building => ids.add(building.id)); cursor = page.nextCursor; pages++;
    } while (cursor);
    expect(ids.size).toBe(301); expect(pages).toBe(13); expect(peak).toBeLessThanOrEqual(4); expect(full).not.toHaveBeenCalled();
  });
  it('keeps a building complete beyond the former 250-door limit', async () => {
    const building = demoWorkspace.buildings[0];
    const repositories = createMemoryWorkspaceRepositories({ ...demoWorkspace, doors: Array.from({ length: 301 }, (_, index) => ({ ...demoWorkspace.doors[0], id: `door-${index}`, buildingId: building.id, currentStatusId: 'do-not-return' })) });
    const result = await loadBuildingDoors(repositories, [building], new AbortController().signal);
    expect(result.doors).toHaveLength(301); expect(result.doors.every(door => door.currentStatusId === 'do-not-return')).toBe(true);
  });
  it('stops scheduling reads after cancellation', async () => {
    const repositories = fixture(); const controller = new AbortController();
    const read = vi.spyOn(repositories.doors, 'listPageByBuilding').mockImplementation(async () => { controller.abort(); throw new Error('cancelled'); });
    await expect(loadBuildingDoors(repositories, (await repositories.buildings.listByZone(demoWorkspace.buildings[0].zoneId!)), controller.signal)).rejects.toBeDefined();
    expect(read.mock.calls.length).toBeLessThanOrEqual(4);
  });
  it('rejects an excessive document budget instead of deriving partial counts', async () => {
    const repositories = fixture(); const original = repositories.doors.listPageByBuilding;
    vi.spyOn(repositories.doors, 'listPageByBuilding').mockImplementation(async (...args) => { const page = await original(...args); return { ...page, metrics: { ...page.metrics, documentsRead: 10001 } }; });
    await expect(loadBuildingDoors(repositories, [demoWorkspace.buildings[0]], new AbortController().signal)).rejects.toThrow('Trop de portes');
  });
});
