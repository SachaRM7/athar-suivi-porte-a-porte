import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, GeoPoint, getDocs, orderBy, query, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoWorkspace } from '../../src/infrastructure/demo/demo-workspace';
import { fromFirestoreDoor, fromFirestoreZone, toFirestoreSeedDocuments } from '../../src/infrastructure/firestore/workspace-codecs';
import { createFirestoreWorkspaceReadRepositories } from '../../src/infrastructure/firestore/firestore-workspace-read-repositories';

const projectId = 'athar-model';
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (const seed of toFirestoreSeedDocuments(demoWorkspace)) {
      batch.set(doc(db, seed.path), seed.data);
    }
    await batch.commit();
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore workspace model', () => {
  it('round-trips the local demo doors through Firestore for an active member', async () => {
    const db = testEnv.authenticatedContext('member-1').firestore();
    const snapshot = await getDocs(query(collection(db, 'workspaces/main/doors'), orderBy('geohash')));
    const doors = snapshot.docs.map((entry) => fromFirestoreDoor(entry.id, entry.data()));

    expect(doors).toHaveLength(6);
    expect(doors.map((door) => door.buildingId).sort()).toEqual(['building-carmes', 'building-carmes', 'building-dalbad', 'building-dalbad', 'building-dalbad', 'building-dalbad']);
    expect(doors.every((door) => door.location.latitude > 43.6 && door.location.longitude > 1.4)).toBe(true);
  });

  it('stores the GeoJSON polygon with Firestore-safe vertices and restores the domain geometry', async () => {
    const db = testEnv.authenticatedContext('member-1').firestore();
    const snapshot = await getDocs(collection(db, 'workspaces/main/zones'));
    const zone = fromFirestoreZone(snapshot.docs[0].id, snapshot.docs[0].data());

    expect(zone.geometry.coordinates).toEqual(demoWorkspace.zones[0].geometry.coordinates);
  });

  it('reads validated dashboard projections and scoped building or viewport slices without a global door query', async () => {
    const db = testEnv.authenticatedContext('member-1').firestore();
    const repositories = createFirestoreWorkspaceReadRepositories(db, 'main');
    const [zones, statuses, stats, buildings, doors] = await Promise.all([
      repositories.zones.list(),
      repositories.statuses.list(),
      repositories.zones.getStats('carmes'),
      repositories.buildings.listByZone('carmes'),
      repositories.doors.listByViewport({ north: 43.609, south: 43.603, east: 1.452, west: 1.441 })
    ]);

    expect(zones.map((zone) => zone.id)).toEqual(['carmes']);
    expect(statuses.map((status) => status.id)).toEqual(['unvisited', 'contacted', 'retry', 'linked', 'do-not-return', 'locked']);
    expect(stats).toMatchObject({ doorCount: 6, countsByStatus: { unvisited: 3, contacted: 2 } });
    expect(buildings).toHaveLength(2);
    expect(doors).toHaveLength(6);
    expect(doors.every((door) => door.zoneId === 'carmes')).toBe(true);
  });

  it('rejects malformed zone stats at the Firestore boundary', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'workspaces/main/zoneStats/carmes'), { doorCount: 'six' }, { merge: true });
    });
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('member-1').firestore(), 'main');
    await expect(repositories.zones.getStats('carmes')).rejects.toThrow('door count');
  });

  it('rejects a malformed status even when its local sort field is missing', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'workspaces/main/statuses/malformed'), {
        label: 'Malformed', color: '#000000', active: true
      });
    });
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('member-1').firestore(), 'main');
    await expect(repositories.statuses.list()).rejects.toThrow('order must be a number');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'workspaces/main/statuses/malformed'));
    });
  });

  it('rejects a malformed building at the paginated Firestore boundary', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'workspaces/main/buildings/malformed-building'), {
        addressLabel: 'Fixture invalide', location: new GeoPoint(43.6058, 1.4454), geohash: 'spc00',
        zoneId: 'malformed-zone', createdBy: 'admin-1', structureRevision: 'zero'
      });
    });
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('member-1').firestore(), 'main');
    await expect(repositories.buildings.listPageByZone('malformed-zone')).rejects.toThrow('structureRevision');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'workspaces/main/buildings/malformed-building'));
    });
  });

  it('rejects a projection whose status counts exceed its door count', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'workspaces/main/zoneStats/overcount'), {
        doorCount: 2,
        countsByStatus: { unvisited: 3 },
        updatedAt: Timestamp.fromDate(new Date('2026-08-03T08:00:00.000Z'))
      });
    });
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('member-1').firestore(), 'main');
    await expect(repositories.zones.getStats('overcount')).rejects.toThrow('exceed the door count');
  });

  it('fails explicitly instead of returning a silently truncated zone', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const batch = writeBatch(context.firestore());
      for (let index = 0; index < 251; index += 1) {
        const id = `overflow-building-${String(index).padStart(3, '0')}`;
        batch.set(doc(context.firestore(), `workspaces/main/buildings/${id}`), {
          addressLabel: `${index} overflow lane`,
          location: new GeoPoint(43.6058, 1.4454),
          geohash: 'spc00',
          zoneId: 'overflow-zone',
          createdBy: 'member-1',
          structureRevision: 0
        });
      }
      await batch.commit();
    });
    const repositories = createFirestoreWorkspaceReadRepositories(testEnv.authenticatedContext('member-1').firestore(), 'main');
    await expect(repositories.buildings.listByZone('overflow-zone')).rejects.toThrow('maximum 250');
  });
});
