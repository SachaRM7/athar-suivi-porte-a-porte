import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateLoadWorkspace } from '../../src/infrastructure/load/generate-load-workspace';
import { toFirestoreSeedDocuments } from '../../src/infrastructure/firestore/workspace-codecs';
import { createFirestoreWorkspaceReadRepositories } from '../../src/infrastructure/firestore/firestore-workspace-read-repositories';
import { ReadAbortedError } from '../../src/domain/workspace/read-pagination';

const projectId = 'athar-pagination';
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
const viewport = { north: 43.616, south: 43.596, east: 1.454, west: 1.426 };
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const documents = toFirestoreSeedDocuments(generateLoadWorkspace());
    for (let offset = 0; offset < documents.length; offset += 500) {
      const batch = writeBatch(db);
      for (const entry of documents.slice(offset, offset + 500)) batch.set(doc(db, entry.path), entry.data);
      await batch.commit();
    }
  });
}, 60_000);

afterAll(async () => { await testEnv.cleanup(); });

async function allPages<T>(read: (cursor: string | null) => Promise<{ items: readonly T[]; nextCursor: string | null; metrics: { documentsRead: number; responseBytes: number; rangeCount: number; duplicateCount: number; falsePositiveCount: number; durationMs: number } }>) {
  const items: T[] = [];
  const metrics = { documentsRead: 0, responseBytes: 0, rangeCount: 0, duplicateCount: 0, falsePositiveCount: 0, durationMs: 0 };
  let cursor: string | null = null;
  do {
    const page = await read(cursor);
    items.push(...page.items);
    metrics.documentsRead += page.metrics.documentsRead;
    metrics.responseBytes += page.metrics.responseBytes;
    metrics.rangeCount += page.metrics.rangeCount;
    metrics.duplicateCount += page.metrics.duplicateCount;
    metrics.falsePositiveCount += page.metrics.falsePositiveCount;
    metrics.durationMs += page.metrics.durationMs;
    cursor = page.nextCursor;
  } while (cursor);
  return { items, metrics };
}

describe('paginated Firestore reads', () => {
  it('pages zone, building and visit reads without a global collection query', async () => {
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('load-member').firestore(), 'load');
    const buildings = await allPages((cursor) => repositories.buildings.listPageByZone('load-zone', { cursor, pageSize: 50 }));
    const doors = await allPages((cursor) => repositories.doors.listPageByBuilding('load-building-000', { cursor, pageSize: 50 }));
    const visits = await allPages((cursor) => repositories.visits.listPageByDoor('load-door-000', { cursor, pageSize: 50 }));

    expect(buildings.items).toHaveLength(300);
    expect(new Set(buildings.items.map((building) => building.id)).size).toBe(300);
    expect(buildings.metrics.documentsRead).toBe(305);
    expect(doors.items).toHaveLength(180);
    expect(new Set(doors.items.map((door) => door.id)).size).toBe(180);
    expect(doors.metrics.documentsRead).toBe(183);
    expect(visits.items).toHaveLength(150);
    expect(visits.metrics.documentsRead).toBe(152);
    expect(buildings.metrics.responseBytes).toBeGreaterThan(0);
    expect(doors.metrics.responseBytes).toBeGreaterThan(0);
    expect(visits.metrics.responseBytes).toBeGreaterThan(0);
    console.log('Load pagination metrics', { buildings: buildings.metrics, doors: doors.metrics, visits: visits.metrics });
  }, 60_000);

  it('pages viewport geohash ranges with exact filtering and no duplicate result IDs', async () => {
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('load-member').firestore(), 'load');
    const buildings = await allPages((cursor) => repositories.buildings.listPageByViewport(viewport, { cursor, pageSize: 50 }));
    const doors = await allPages((cursor) => repositories.doors.listPageByViewport(viewport, { cursor, pageSize: 50 }));

    expect(buildings.items).toHaveLength(299);
    expect(new Set(buildings.items.map((building) => building.id)).size).toBe(buildings.items.length);
    expect(doors.items).toHaveLength(478);
    expect(new Set(doors.items.map((door) => door.id)).size).toBe(doors.items.length);
    expect(buildings.metrics.documentsRead).toBeGreaterThanOrEqual(buildings.items.length);
    expect(doors.metrics.documentsRead).toBeGreaterThanOrEqual(doors.items.length);
    expect(buildings.metrics.falsePositiveCount).toBe(1);
    expect(doors.metrics.falsePositiveCount).toBe(1);
    console.log('Viewport pagination metrics', { buildings: buildings.metrics, doors: doors.metrics });
  }, 60_000);

  it('drops a read before it starts when a newer viewport request has aborted it', async () => {
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('load-member').firestore(), 'load');
    const controller = new AbortController();
    controller.abort();
    await expect(repositories.buildings.listPageByViewport(viewport, { signal: controller.signal })).rejects.toBeInstanceOf(ReadAbortedError);
  });

  it('rejects cursors reused outside their original scope and page sizes above budget', async () => {
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('load-member').firestore(), 'load');
    const zonePage = await repositories.buildings.listPageByZone('load-zone', { pageSize: 1 });
    const viewportPage = await repositories.buildings.listPageByViewport(viewport, { pageSize: 1 });
    expect(zonePage.nextCursor).not.toBeNull();
    expect(viewportPage.nextCursor).not.toBeNull();

    await expect(repositories.buildings.listPageByZone('another-zone', {
      cursor: zonePage.nextCursor,
      pageSize: 1
    })).rejects.toThrow('Read cursor is invalid.');
    await expect(repositories.buildings.listPageByViewport({ ...viewport, east: viewport.east + 0.001 }, {
      cursor: viewportPage.nextCursor,
      pageSize: 1
    })).rejects.toThrow('Read cursor is invalid.');
    await expect(repositories.buildings.listPageByZone('load-zone', { pageSize: 101 }))
      .rejects.toThrow('Page size must be an integer from 1 to 100.');
  });
});
