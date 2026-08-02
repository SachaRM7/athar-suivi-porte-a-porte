import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, GeoPoint, setDoc, Timestamp } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FirestoreDoorGateway } from '../../src/infrastructure/firestore/firestore-door-gateway';
import { RevisionConflictError, SyncRejectedError } from '../../src/domain/sync/sync-service';

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
    await setDoc(doc(db, `${workspace}/doors/door-a`), {
      buildingId: 'building-a', zoneId: 'zone-a', location: new GeoPoint(43.61, 1.44), geohash: 'spc00', floor: 0, label: '01',
      createdBy: 'member-a', currentStatusId: 'unvisited', revision: 1, lastVisitId: null
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
});
