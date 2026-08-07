import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { doc, GeoPoint, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FirestoreBuildingGateway } from '../../src/infrastructure/firestore/firestore-building-gateway';

const projectId = 'athar-building-creation';
const workspace = 'workspaces/main';
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
let testEnv: RulesTestEnvironment;

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `${workspace}/members/admin-a`), { role: 'admin', active: true, createdAt: Timestamp.now() });
    await setDoc(doc(db, `${workspace}/members/member-a`), { role: 'member', active: true, createdAt: Timestamp.now() });
    await setDoc(doc(db, `${workspace}/zones/zone-a`), { name: 'Zone A' });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } });
});

afterEach(async () => { await testEnv.clearFirestore(); });
afterAll(async () => { await testEnv.cleanup(); });

describe('building creation against emulator rules', () => {
  it('creates a building and the four default statuses for an active member', async () => {
    await seed();
    const db = testEnv.authenticatedContext('member-a').firestore();
    const gateway = new FirestoreBuildingGateway(db, 'main', () => 'member-a');

    await gateway.create({
      id: 'building-new', addressLabel: '12 rue du test', location: { latitude: 43.61, longitude: 1.44 },
      geohash: 'spc00', zoneId: 'zone-a', createdBy: 'member-a', structureRevision: 0
    });

    expect((await getDoc(doc(db, `${workspace}/buildings/building-new`))).data()).toMatchObject({
      addressLabel: '12 rue du test', location: new GeoPoint(43.61, 1.44), zoneId: 'zone-a', structureRevision: 0
    });
    for (const statusId of ['unvisited', 'contacted', 'retry', 'do-not-return']) {
      expect((await getDoc(doc(db, `${workspace}/statuses/${statusId}`))).exists()).toBe(true);
    }
  });
});
