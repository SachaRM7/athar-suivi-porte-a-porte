import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, orderBy, query, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoWorkspace } from '../../src/infrastructure/demo/demo-workspace';
import { fromFirestoreDoor, fromFirestoreZone, toFirestoreSeedDocuments } from '../../src/infrastructure/firestore/workspace-codecs';

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

    expect(doors).toHaveLength(4);
    expect(doors.map((door) => door.buildingId).sort()).toEqual(['building-carmes', 'building-carmes', 'building-dalbad', 'building-dalbad']);
    expect(doors.every((door) => door.location.latitude > 43.6 && door.location.longitude > 1.4)).toBe(true);
  });

  it('stores the GeoJSON polygon with Firestore-safe vertices and restores the domain geometry', async () => {
    const db = testEnv.authenticatedContext('member-1').firestore();
    const snapshot = await getDocs(collection(db, 'workspaces/main/zones'));
    const zone = fromFirestoreZone(snapshot.docs[0].id, snapshot.docs[0].data());

    expect(zone.geometry.coordinates).toEqual(demoWorkspace.zones[0].geometry.coordinates);
  });
});
