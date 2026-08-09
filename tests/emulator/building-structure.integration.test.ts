import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, GeoPoint, getDoc, setDoc, Timestamp, writeBatch, serverTimestamp } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateUniformDoorTargets } from '../../src/domain/workspace/building-structure';
import { FirestoreBuildingGateway } from '../../src/infrastructure/firestore/firestore-building-gateway';
import { FirestoreBuildingStructureGateway, StructureRevisionConflictError } from '../../src/infrastructure/firestore/firestore-building-structure-gateway';

const projectId = 'athar-structure';
const workspace = 'workspaces/main';
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
let testEnv: RulesTestEnvironment;

function doorData(index: number, overrides: Record<string, unknown> = {}) {
  return {
    buildingId: 'building-a',
    zoneId: 'zone-a',
    location: new GeoPoint(43.61, 1.44),
    geohash: 'spc00',
    floor: 0,
    label: String(101 + index),
    sortOrder: index,
    active: true,
    currentStatusId: index % 2 === 0 ? 'contacted' : 'retry',
    revision: index + 1,
    lastVisitId: `visit-${index}`,
    createdBy: 'admin-a',
    ...overrides
  };
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `${workspace}/members/admin-a`), { role: 'admin', active: true, createdAt: Timestamp.now() });
    await setDoc(doc(db, `${workspace}/members/member-a`), { role: 'member', active: true, createdAt: Timestamp.now() });
    await setDoc(doc(db, `${workspace}/statuses/unvisited`), { label: 'Pas encore fait', color: '#8B948F', order: 0, active: true });
    await setDoc(doc(db, `${workspace}/statuses/contacted`), { label: 'Contact', color: '#16835F', order: 1, active: true });
    await setDoc(doc(db, `${workspace}/statuses/retry`), { label: 'Repasser', color: '#D8A200', order: 2, active: true });
    await setDoc(doc(db, `${workspace}/zones/zone-a`), { name: 'Zone A' });
    await setDoc(doc(db, `${workspace}/buildings/building-a`), {
      addressLabel: '18 rue de test', location: new GeoPoint(43.61, 1.44), geohash: 'spc00', zoneId: 'zone-a', createdBy: 'admin-a', structureRevision: 4
    });
    const batch = writeBatch(db);
    for (let index = 0; index < 10; index += 1) batch.set(doc(db, `${workspace}/doors/door-${index}`), doorData(index));
    await batch.commit();
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('building structure against emulator rules', () => {
  it('materializes a detected building and creates its twelve initial doors', async () => {
    await seed();
    const db = testEnv.authenticatedContext('member-a').firestore();
    const buildingGateway = new FirestoreBuildingGateway(db, 'main', () => 'member-a');
    const structureGateway = new FirestoreBuildingStructureGateway(db, 'main', () => 'member-a');

    await buildingGateway.create({
      id: 'building-detected',
      addressLabel: 'Bâtiment détecté',
      location: { latitude: 43.61, longitude: 1.44 },
      geohash: 'spc00',
      zoneId: 'zone-a',
      createdBy: 'member-a',
      structureRevision: 0
    });
    let nextId = 0;
    const diff = await structureGateway.apply({
      buildingId: 'building-detected',
      expectedStructureRevision: 0,
      targets: generateUniformDoorTargets({ floorCount: 3, doorsPerFloor: 4, firstLabel: 101 }),
      authorId: 'member-a',
      createDoorId: () => `door-detected-${nextId++}`
    });

    expect(diff.created).toHaveLength(12);
    expect((await getDoc(doc(db, `${workspace}/buildings/building-detected`))).data()).toMatchObject({ structureRevision: 1 });
  });

  it('extends ten treated doors to twelve without resetting the original ten', async () => {
    await seed();
    const db = testEnv.authenticatedContext('admin-a').firestore();
    let nextId = 10;
    const gateway = new FirestoreBuildingStructureGateway(db, 'main', () => 'admin-a');

    const diff = await gateway.apply({
      buildingId: 'building-a',
      expectedStructureRevision: 4,
      targets: generateUniformDoorTargets({ floorCount: 1, doorsPerFloor: 12, firstLabel: 101 }),
      authorId: 'admin-a',
      createDoorId: () => `door-${nextId++}`
    });

    expect(diff.building.structureRevision).toBe(5);
    expect(diff.created).toHaveLength(2);
    for (let index = 0; index < 10; index += 1) {
      const stored = await getDoc(doc(db, `${workspace}/doors/door-${index}`));
      expect(stored.exists()).toBe(true);
      expect(stored.data()).toMatchObject({ revision: index + 1, lastVisitId: `visit-${index}`, currentStatusId: index % 2 === 0 ? 'contacted' : 'retry' });
    }
    const createdDoor = await getDoc(doc(db, `${workspace}/doors/door-10`));
    expect(createdDoor.exists()).toBe(true);
    expect(createdDoor.data()).toMatchObject({ active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null });
  });

  it('allows a structure bump and a concurrent status batch without coupling their revisions', async () => {
    await seed();
    const db = testEnv.authenticatedContext('admin-a').firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, `${workspace}/buildings/building-a`), { structureRevision: 5, updatedAt: serverTimestamp() });
    batch.set(doc(db, `${workspace}/doors/door-10`), doorData(10, { currentStatusId: 'unvisited', revision: 0, lastVisitId: null }));
    const concurrentAt = Timestamp.now();
    batch.set(doc(db, `${workspace}/visits/visit-structure-concurrent`), {
      doorId: 'door-0', statusId: 'retry', note: '', authorId: 'admin-a', occurredAt: concurrentAt, syncedAt: serverTimestamp(), doorRevision: 2
    });
    batch.update(doc(db, `${workspace}/doors/door-0`), {
      currentStatusId: 'retry', revision: 2, lastVisitId: 'visit-structure-concurrent', lastVisitAt: concurrentAt, updatedAt: serverTimestamp()
    });

    await assertSucceeds(batch.commit());
    expect((await getDoc(doc(db, `${workspace}/buildings/building-a`))).data()).toMatchObject({ structureRevision: 5 });
    expect((await getDoc(doc(db, `${workspace}/doors/door-0`))).data()).toMatchObject({ revision: 2, currentStatusId: 'retry', lastVisitId: 'visit-structure-concurrent' });
  });

  it('keeps an offline passage acceptable after the structure archives its door', async () => {
    await seed();
    const adminDb = testEnv.authenticatedContext('admin-a').firestore();
    const structure = writeBatch(adminDb);
    structure.update(doc(adminDb, `${workspace}/buildings/building-a`), { structureRevision: 5, updatedAt: serverTimestamp() });
    structure.update(doc(adminDb, `${workspace}/doors/door-0`), { active: false, updatedAt: serverTimestamp() });
    await assertSucceeds(structure.commit());

    const db = testEnv.authenticatedContext('member-a').firestore();
    const delayedVisit = writeBatch(db);
    const delayedAt = Timestamp.now();
    delayedVisit.set(doc(db, `${workspace}/visits/visit-before-archive`), {
      doorId: 'door-0', statusId: 'retry', note: '', authorId: 'member-a', occurredAt: delayedAt, syncedAt: serverTimestamp(), doorRevision: 2
    });
    delayedVisit.update(doc(db, `${workspace}/doors/door-0`), {
      currentStatusId: 'retry', revision: 2, lastVisitId: 'visit-before-archive', lastVisitAt: delayedAt, updatedAt: serverTimestamp()
    });
    await assertSucceeds(delayedVisit.commit());

    expect((await getDoc(doc(db, `${workspace}/doors/door-0`))).data()).toMatchObject({
      active: false,
      revision: 2,
      currentStatusId: 'retry',
      lastVisitId: 'visit-before-archive'
    });
  });

  it('requires the building structure revision for a structural door update', async () => {
    await seed();
    const db = testEnv.authenticatedContext('member-a').firestore();

    await assertFails(setDoc(doc(db, `${workspace}/doors/door-0`), { sortOrder: 99 }, { merge: true }));
  });

  it('reserves archiving a visited door for the coordinator', async () => {
    await seed();
    const db = testEnv.authenticatedContext('member-a').firestore();
    const structure = writeBatch(db);
    structure.update(doc(db, `${workspace}/buildings/building-a`), { structureRevision: 5, updatedAt: serverTimestamp() });
    structure.update(doc(db, `${workspace}/doors/door-0`), { active: false, updatedAt: serverTimestamp() });

    await assertFails(structure.commit());
  });

  it('replaces a physical door with an explicit new ID without reusing the archived history', async () => {
    await seed();
    const db = testEnv.authenticatedContext('admin-a').firestore();
    const gateway = new FirestoreBuildingStructureGateway(db, 'main', () => 'admin-a');
    const targets = [
      { newDoorId: 'door-physical-replacement', floor: 0, label: '101', sortOrder: 0 },
      ...Array.from({ length: 9 }, (_, offset) => ({
        existingDoorId: `door-${offset + 1}`,
        floor: 0,
        label: String(102 + offset),
        sortOrder: offset + 1
      }))
    ];

    await gateway.apply({ buildingId: 'building-a', expectedStructureRevision: 4, targets, authorId: 'admin-a', createDoorId: () => 'unused' });

    expect((await getDoc(doc(db, `${workspace}/doors/door-0`))).data()).toMatchObject({
      active: false,
      revision: 1,
      lastVisitId: 'visit-0',
      currentStatusId: 'contacted'
    });
    expect((await getDoc(doc(db, `${workspace}/doors/door-physical-replacement`))).data()).toMatchObject({
      active: true,
      revision: 0,
      lastVisitId: null,
      currentStatusId: 'unvisited'
    });
  });

  it('rejects a stale structure revision before it can alter a door', async () => {
    await seed();
    const db = testEnv.authenticatedContext('admin-a').firestore();
    const gateway = new FirestoreBuildingStructureGateway(db, 'main', () => 'admin-a');

    await expect(gateway.apply({
      buildingId: 'building-a',
      expectedStructureRevision: 3,
      targets: [],
      authorId: 'admin-a',
      createDoorId: () => 'unused'
    })).rejects.toBeInstanceOf(StructureRevisionConflictError);
  });
});
