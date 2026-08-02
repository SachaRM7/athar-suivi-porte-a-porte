import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  GeoPoint,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

const projectId = 'athar-local';
const workspaceId = 'main';
const workspace = `workspaces/${workspaceId}`;
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
let testEnv: RulesTestEnvironment;

function member(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `${workspace}/members/admin-a`), {
      username: 'admin-a',
      displayName: 'Admin A',
      role: 'admin',
      active: true,
      createdAt: Timestamp.now()
    });
    await setDoc(doc(db, `${workspace}/members/member-a`), {
      username: 'member-a',
      displayName: 'Member A',
      role: 'member',
      active: true,
      createdAt: Timestamp.now()
    });
    await setDoc(doc(db, `${workspace}/members/member-b`), {
      username: 'member-b',
      displayName: 'Member B',
      role: 'member',
      active: true,
      createdAt: Timestamp.now()
    });
    await setDoc(doc(db, `${workspace}/members/inactive-a`), {
      username: 'inactive-a',
      displayName: 'Inactive A',
      role: 'member',
      active: false,
      createdAt: Timestamp.now()
    });
    await setDoc(doc(db, `${workspace}/statuses/unvisited`), statusData({ label: 'Pas visite', order: 0 }));
    await setDoc(doc(db, `${workspace}/statuses/contacted`), statusData());
    await setDoc(doc(db, `${workspace}/zones/zone-a`), zoneData());
    await setDoc(doc(db, `${workspace}/buildings/building-a`), {
      addressLabel: '18 rue de test',
      location: new GeoPoint(43.61, 1.44),
      geohash: 'spc00',
      zoneId: 'zone-a',
      createdBy: 'admin-a'
    });
    await setDoc(doc(db, `${workspace}/doors/door-a`), {
      buildingId: 'building-a',
      zoneId: 'zone-a',
      location: new GeoPoint(43.61, 1.44),
      geohash: 'spc00',
      floor: 0,
      label: '01',
      createdBy: 'admin-a',
      currentStatusId: 'unvisited',
      revision: 0,
      lastVisitId: null
    });
  });
}

function statusData(overrides: Record<string, unknown> = {}) {
  return { label: 'Contact', color: '#16835F', order: 1, active: true, ...overrides };
}

function zoneData(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Zone A',
    geometry: { type: 'Polygon', vertices: [
      { latitude: 43.60, longitude: 1.43 }, { latitude: 43.60, longitude: 1.45 },
      { latitude: 43.62, longitude: 1.45 }, { latitude: 43.60, longitude: 1.43 }
    ] },
    bbox: { north: 43.62, south: 43.60, east: 1.45, west: 1.43 },
    color: '#16835F',
    coverageState: 'prepared',
    assigneeLabel: null,
    ...overrides
  };
}

function visitData(overrides: Record<string, unknown> = {}) {
  return {
    doorId: 'door-a',
    statusId: 'contacted',
    note: 'Interphone HS',
    authorId: 'member-a',
    occurredAt: Timestamp.fromDate(new Date('2026-07-29T12:00:00Z')),
    syncedAt: serverTimestamp(),
    doorRevision: 1,
    ...overrides
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8180,
      rules
    }
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore security rules', () => {
  it('denies all data to an inactive member', async () => {
    await seed();
    await assertFails(getDoc(doc(member('inactive-a'), `${workspace}/doors/door-a`)));
  });

  it('lets an active member read but reserves zones and statuses to admins', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(member('member-a'), `${workspace}/doors/door-a`)));
    await assertFails(setDoc(doc(member('member-a'), `${workspace}/zones/zone-a`), { name: 'Nope' }));
    await assertSucceeds(setDoc(doc(member('admin-a'), `${workspace}/zones/zone-b`), zoneData({ name: 'Allowed' })));
  });

  it('accepts only complete status and zone schemas from an administrator', async () => {
    await seed();
    const db = member('admin-a');
    await assertSucceeds(setDoc(doc(db, `${workspace}/statuses/retry`), statusData({ label: 'A revenir', order: 2 })));
    await assertFails(setDoc(doc(db, `${workspace}/statuses/bad-color`), statusData({ color: 'green' })));
    await assertFails(setDoc(doc(db, `${workspace}/zones/bad-zone`), zoneData({ geometry: { type: 'Polygon', vertices: [] } })));
  });

  it('forces member administration through privileged functions', async () => {
    await seed();
    await assertFails(updateDoc(doc(member('admin-a'), `${workspace}/members/member-a`), { active: false }));
    await assertFails(setDoc(doc(member('admin-a'), `${workspace}/members/direct-member`), {
      username: 'direct-member', displayName: 'Direct', role: 'member', active: true, createdAt: Timestamp.now()
    }));
  });

  it('validates building and door references against the shared location', async () => {
    await seed();
    const db = member('member-a');
    await assertSucceeds(setDoc(doc(db, `${workspace}/buildings/building-member`), {
      addressLabel: '20 rue de test', location: new GeoPoint(43.611, 1.441), geohash: 'spc01', zoneId: 'zone-a', createdBy: 'member-a'
    }));
    await assertSucceeds(setDoc(doc(db, `${workspace}/doors/door-member`), {
      buildingId: 'building-member', zoneId: 'zone-a', location: new GeoPoint(43.611, 1.441), geohash: 'spc01',
      floor: 0, label: '01', currentStatusId: 'unvisited', revision: 0, lastVisitId: null, createdBy: 'member-a'
    }));
    await assertFails(setDoc(doc(db, `${workspace}/doors/door-fake-location`), {
      buildingId: 'building-member', zoneId: 'zone-a', location: new GeoPoint(43.7, 1.5), geohash: 'spc01',
      floor: 0, label: '02', currentStatusId: 'unvisited', revision: 0, lastVisitId: null, createdBy: 'member-a'
    }));
  });

  it('requires a matching visit and revision in the same batch as a door status change', async () => {
    await seed();
    const db = member('member-a');
    const batch = writeBatch(db);
    batch.set(doc(db, `${workspace}/visits/visit-a`), visitData());
    batch.update(doc(db, `${workspace}/doors/door-a`), {
      currentStatusId: 'contacted',
      revision: 1,
      lastVisitId: 'visit-a',
      updatedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
  });

  it('rejects a direct door mutation, a foreign author and a stale revision', async () => {
    await seed();
    const db = member('member-a');
    await assertFails(updateDoc(doc(db, `${workspace}/doors/door-a`), {
      currentStatusId: 'contacted',
      revision: 1,
      lastVisitId: 'visit-direct',
      updatedAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(db, `${workspace}/visits/visit-foreign`), visitData({ authorId: 'member-b' })));

    const stale = writeBatch(db);
    stale.set(doc(db, `${workspace}/visits/visit-stale`), visitData({ doorRevision: 0 }));
    stale.update(doc(db, `${workspace}/doors/door-a`), {
      currentStatusId: 'contacted',
      revision: 0,
      lastVisitId: 'visit-stale',
      updatedAt: serverTimestamp()
    });
    await assertFails(stale.commit());
  });

  it('keeps visits immutable after their atomic creation', async () => {
    await seed();
    const db = member('member-a');
    const batch = writeBatch(db);
    batch.set(doc(db, `${workspace}/visits/visit-a`), visitData());
    batch.update(doc(db, `${workspace}/doors/door-a`), {
      currentStatusId: 'contacted',
      revision: 1,
      lastVisitId: 'visit-a',
      updatedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(doc(db, `${workspace}/visits/visit-a`), { note: 'Changed' }));
  });

  it('rejects immutable door fields even when the atomic visit is otherwise valid', async () => {
    await seed();
    const db = member('member-a');
    const batch = writeBatch(db);
    batch.set(doc(db, `${workspace}/visits/visit-forbidden-field`), visitData());
    batch.update(doc(db, `${workspace}/doors/door-a`), {
      currentStatusId: 'contacted',
      revision: 1,
      lastVisitId: 'visit-forbidden-field',
      createdBy: 'member-a',
      updatedAt: serverTimestamp()
    });
    await assertFails(batch.commit());
  });
});
