import { createRequire } from 'node:module';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { readWorkspaceSnapshot, publishStats, rebuildWorkspaceStats } = require('./stats-rebuild.js');
const { computeWorkspaceStats } = require('./stats-core.js');
const app = initializeApp({ projectId: 'athar-stats' }, 'stats-tests');
const db = getFirestore(app);
const root = db.doc('workspaces/main');
beforeAll(async () => {
  await root.collection('zones').doc('z').set({ geometry: { vertices: [{ longitude: 0, latitude: 0 }] } });
  await root.collection('buildings').doc('b').set({ zoneId: 'z' });
  for (let start = 0; start < 900; start += 300) {
    const batch = db.batch();
    for (let i = start; i < start + 300; i++) batch.set(root.collection('doors').doc(`d${String(i).padStart(4, '0')}`), {
      buildingId: 'b', zoneId: 'z', active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, lastVisitAt: null
    });
    await batch.commit();
  }
});
afterAll(() => deleteApp(app));
describe('canonical zone stats reconstruction', () => {
  it('reads beyond existing 250 caps at one snapshot; publishing rejects late generations', async () => {
    const old = await readWorkspaceSnapshot(db, 'main');
    expect(old.doors).toHaveLength(900);
    const now = Timestamp.now();
    const batch = db.batch();
    batch.set(root.collection('visits').doc('v'), { doorId: 'd0000', statusId: 'do-not-return', doorRevision: 1, occurredAt: now, syncedAt: now, authorId: 'a' });
    batch.update(root.collection('doors').doc('d0000'), { currentStatusId: 'do-not-return', revision: 1, lastVisitId: 'v', lastVisitAt: now });
    await batch.commit();
    const result = await rebuildWorkspaceStats(db, 'main'); expect(result.published).toBe(true);
    expect(await publishStats(db, 'main', old, computeWorkspaceStats(old))).toBe(false);
    const stats = (await root.collection('zoneStats').doc('z').get()).data()!;
    expect(stats).toMatchObject({ doorCount: 900, visitedDoorCount: 1, excludedDoorCount: 1, completeness: 'complete' });
    expect(stats.countsByStatus.unvisited).toBe(899);
  });
  it('a write between pages cannot leak into a consistent snapshot', async () => {
    let written = false;
    const snapshot = await readWorkspaceSnapshot(db, 'main', { afterPage: async (path: string, count: number) => {
      if (!written && path.endsWith('/doors') && count === 400) {
        written = true; await root.collection('doors').doc('d0899').update({ active: false });
      }
    } });
    expect(snapshot.doors.find((d: { id: string }) => d.id === 'd0899').active).toBe(true);
    await rebuildWorkspaceStats(db, 'main');
    expect((await root.collection('zoneStats').doc('z').get()).data()?.doorCount).toBe(899);
  });
  it('failed or interrupted scans never publish partial counts and a retry repairs the state', async () => {
    await expect(rebuildWorkspaceStats(db, 'main', { maxDocuments: 450 })).rejects.toThrow('budget');
    expect((await root.collection('zoneStats').doc('z').get()).data()).toMatchObject({ doorCount: 899, completeness: 'incomplete' });
    await rebuildWorkspaceStats(db, 'main');
    expect((await root.collection('zoneStats').doc('z').get()).data()?.completeness).toBe('complete');
  });
  it('concurrent rebuilds converge without incrementing and zone deletion removes projections', async () => {
    await Promise.all([rebuildWorkspaceStats(db, 'main'), rebuildWorkspaceStats(db, 'main')]);
    expect((await root.collection('zoneStats').doc('z').get()).data()?.visitedDoorCount).toBe(1);
    await root.collection('zones').doc('z').delete();
    await rebuildWorkspaceStats(db, 'main');
    expect((await root.collection('zoneStats').doc('z').get()).exists).toBe(false);
  });
});
