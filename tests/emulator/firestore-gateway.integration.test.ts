import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, GeoPoint, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FirestoreDoorGateway } from '../../src/infrastructure/firestore/firestore-door-gateway';
import { MemoryOutbox, RevisionConflictError, SyncLab, SyncRejectedError } from '../../src/domain/sync/sync-service';

const projectId = 'athar-local';
const workspace = 'workspaces/main';
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
let testEnv: RulesTestEnvironment;

function intent(overrides: Record<string, unknown> = {}) {
  return {
    commandId: 'visit-adapter',
    authorId: 'member-a',
    doorId: 'door-a',
    statusId: 'contacted' as const,
    note: 'Bonjour',
    expectedRevision: 1,
    createdAt: '2026-07-29T12:00:00.000Z',
    ...overrides
  };
}

async function seed(active = true) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `${workspace}/members/member-a`), { role: 'member', active, createdAt: Timestamp.now() });
    await setDoc(doc(db, `${workspace}/members/member-b`), { role: 'member', active: true, createdAt: Timestamp.now() });
    await setDoc(doc(db, `${workspace}/statuses/contacted`), { label: 'Contact', color: '#16835F', order: 1, active: true });
    await setDoc(doc(db, `${workspace}/doors/door-a`), {
      buildingId: 'building-a', zoneId: 'zone-a', location: new GeoPoint(43.61, 1.44), geohash: 'spc00', floor: 0, label: '01',
      sortOrder: 0, active: true, createdBy: 'member-a', currentStatusId: 'unvisited', revision: 1, lastVisitId: null
    });
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

describe('FirestoreDoorGateway against emulator rules', () => {
  it('creates the visit UUID and advances the door in one accepted batch', async () => {
    await seed();
    const db = testEnv.authenticatedContext('member-a').firestore();
    const gateway = new FirestoreDoorGateway(db, 'main', () => 'member-a');

    await expect(gateway.commit(intent({ commandId: 'visit-atomic' }))).resolves.toMatchObject({ id: 'door-a', revision: 2, lastVisitId: 'visit-atomic' });
    const visit = await getDoc(doc(db, `${workspace}/visits/visit-atomic`));
    const door = await getDoc(doc(db, `${workspace}/doors/door-a`));
    expect(visit.exists()).toBe(true);
    expect(visit.data()).toMatchObject({ doorId: 'door-a', authorId: 'member-a', doorRevision: 2 });
    expect(door.data()).toMatchObject({ revision: 2, currentStatusId: 'contacted', lastVisitId: 'visit-atomic' });
  });

  it('keeps an emulator-backed intention pending while offline then sends it on recovery', async () => {
    await seed();
    let online = false;
    const gateway = new FirestoreDoorGateway(
      testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a', () => online
    );
    const outbox = new MemoryOutbox();
    await outbox.add(intent({ commandId: 'visit-reconnect' }));
    const sync = new SyncLab(gateway, outbox, 'member-a');

    await sync.flush();
    await expect(outbox.pending()).resolves.toHaveLength(1);
    online = true;
    await sync.flush();
    await expect(outbox.all()).resolves.toEqual([]);
    const visit = await getDoc(doc(testEnv.authenticatedContext('member-a').firestore(), `${workspace}/visits/visit-reconnect`));
    expect(visit.exists()).toBe(true);
  });

  it('recognizes an already acknowledged UUID after a client-side interruption', async () => {
    await seed();
    const db = testEnv.authenticatedContext('member-a').firestore();
    const gateway = new FirestoreDoorGateway(db, 'main', () => 'member-a');
    const queued = intent({ commandId: 'visit-idempotent' });
    await gateway.commit(queued);

    await expect(gateway.commit(queued)).resolves.toMatchObject({
      id: 'door-a', revision: 2, lastVisitId: 'visit-idempotent', currentStatusId: 'contacted'
    });
  });

  it('recognizes an acknowledged UUID even if its status was disabled after acceptance', async () => {
    await seed();
    const db = testEnv.authenticatedContext('member-a').firestore();
    const gateway = new FirestoreDoorGateway(db, 'main', () => 'member-a');
    const queued = intent({ commandId: 'visit-accepted-before-status-change' });
    await gateway.commit(queued);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `${workspace}/statuses/contacted`), { active: false }, { merge: true });
    });

    await expect(gateway.commit(queued)).resolves.toMatchObject({
      revision: 2,
      lastVisitId: 'visit-accepted-before-status-change',
      currentStatusId: 'contacted'
    });
  });

  it('classifies the second of two emulator clients as a conflict and retains its UUID', async () => {
    await seed();
    const first = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');
    const second = new FirestoreDoorGateway(testEnv.authenticatedContext('member-b').firestore(), 'main', () => 'member-b');
    await first.commit(intent({ commandId: 'visit-client-a' }));

    await expect(second.commit(intent({ commandId: 'visit-client-b', authorId: 'member-b' }))).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it('classifies a permission denial with an advanced revision as a conflict', async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `${workspace}/doors/door-a`), { currentStatusId: 'retry', revision: 2, lastVisitId: 'remote-visit' }, { merge: true });
    });
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');

    await expect(gateway.commit(intent())).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it('classifies an inactive member after the server refusal', async () => {
    await seed(false);
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');

    await expect(gateway.commit(intent())).rejects.toMatchObject({ category: 'inactive-member' } satisfies Partial<SyncRejectedError>);
  });

  it('classifies a missing member profile as inactive instead of losing the refusal diagnostic', async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), `${workspace}/members/member-a`));
    });
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');

    await expect(gateway.commit(intent())).rejects.toMatchObject({ category: 'inactive-member' } satisfies Partial<SyncRejectedError>);
  });

  it('classifies a different authenticated author before sending a batch', async () => {
    await seed();
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-b');

    await expect(gateway.commit(intent())).rejects.toMatchObject({ category: 'author-mismatch' } satisfies Partial<SyncRejectedError>);
  });

  it('classifies an invalid visit after the rules reject it', async () => {
    await seed();
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');

    await expect(gateway.commit(intent({ note: 'x'.repeat(281) }))).rejects.toMatchObject({ category: 'invalid-intent' } satisfies Partial<SyncRejectedError>);
    await assertFails(setDoc(doc(testEnv.authenticatedContext('member-a').firestore(), `${workspace}/visits/invalid-direct`), { note: 'x'.repeat(281) }));
  });

  it('keeps an inactive status classified as invalid even when the door revision also advanced', async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, `${workspace}/statuses/contacted`), { active: false }, { merge: true });
      await setDoc(doc(db, `${workspace}/doors/door-a`), { currentStatusId: 'retry', revision: 2, lastVisitId: 'remote-visit' }, { merge: true });
    });
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');

    await expect(gateway.commit(intent())).rejects.toMatchObject({ category: 'invalid-intent' } satisfies Partial<SyncRejectedError>);
  });

  it('does not disguise a lower server revision as a concurrent-write conflict', async () => {
    await seed();
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');

    await expect(gateway.commit(intent({ expectedRevision: 2 }))).rejects.toMatchObject({ category: 'security' } satisfies Partial<SyncRejectedError>);
  });

  it('rejects malformed timestamps before constructing the Firestore batch', async () => {
    await seed();
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');

    await expect(gateway.commit(intent({ createdAt: 'not-a-date' }))).rejects.toMatchObject({ category: 'invalid-intent' } satisfies Partial<SyncRejectedError>);
  });

  it('rejects unsafe Firestore document identifiers before constructing references', async () => {
    await seed();
    const gateway = new FirestoreDoorGateway(testEnv.authenticatedContext('member-a').firestore(), 'main', () => 'member-a');

    await expect(gateway.commit(intent({ commandId: 'nested/visit' }))).rejects.toMatchObject({ category: 'invalid-intent' } satisfies Partial<SyncRejectedError>);
  });
});
