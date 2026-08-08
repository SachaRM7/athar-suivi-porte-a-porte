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
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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
      createdBy: 'admin-a',
      structureRevision: 0
    });
    await setDoc(doc(db, `${workspace}/doors/door-a`), {
      buildingId: 'building-a',
      zoneId: 'zone-a',
      location: new GeoPoint(43.61, 1.44),
      geohash: 'spc00',
      floor: 0,
      label: '01',
      sortOrder: 0,
      active: true,
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

  it('allows only an administrator to delete a zone', async () => {
    await seed();
    await assertFails(deleteDoc(doc(member('member-a'), `${workspace}/zones/zone-a`)));
    await assertSucceeds(deleteDoc(doc(member('admin-a'), `${workspace}/zones/zone-a`)));
    const deleted = await getDoc(doc(member('admin-a'), `${workspace}/zones/zone-a`));
    expect(deleted.exists()).toBe(false);
  });

  it('accepts only complete status and zone schemas from an administrator', async () => {
    await seed();
    const db = member('admin-a');
    await assertSucceeds(setDoc(doc(db, `${workspace}/statuses/retry`), statusData({ label: 'A revenir', order: 2 })));
    await assertFails(setDoc(doc(db, `${workspace}/statuses/bad-color`), statusData({ color: 'green' })));
    await assertFails(setDoc(doc(db, `${workspace}/zones/bad-zone`), zoneData({ geometry: { type: 'Polygon', vertices: [] } })));
  });

  it('lets an active member bootstrap only the fixed default statuses', async () => {
    await seed();
    const db = member('member-a');
    await assertSucceeds(setDoc(doc(db, `${workspace}/statuses/retry`), {
      label: 'A revenir', color: '#D8A200', order: 2, active: true
    }));
    await assertFails(setDoc(doc(db, `${workspace}/statuses/custom-member`), statusData({ label: 'Libre' })));
  });

  it('denies all client setup reads and writes, including direct initial administrator promotion', async () => {
    await seed();
    const first = member('member-a');
    const bootstrap = writeBatch(first);
    bootstrap.set(doc(first, `${workspace}/setup/initial-admin`), { uid: 'member-a', createdAt: serverTimestamp() });
    bootstrap.update(doc(first, `${workspace}/members/member-a`), { role: 'admin' });
    await assertFails(bootstrap.commit());
    await assertFails(getDoc(doc(first, `${workspace}/setup/admin-bootstrap`)));
    await assertFails(getDoc(doc(first, `${workspace}/setup/initial-admin`)));
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
    const db = member('admin-a');
    await assertSucceeds(setDoc(doc(member('member-a'), `${workspace}/buildings/building-member`), {
      addressLabel: '20 rue de test', location: new GeoPoint(43.611, 1.441), geohash: 'spc01', zoneId: 'zone-a', createdBy: 'member-a', structureRevision: 0
    }));
    const structure = writeBatch(db);
    structure.update(doc(db, `${workspace}/buildings/building-member`), { structureRevision: 1, updatedAt: serverTimestamp() });
    structure.set(doc(db, `${workspace}/doors/door-member`), {
      buildingId: 'building-member', zoneId: 'zone-a', location: new GeoPoint(43.611, 1.441), geohash: 'spc01',
      floor: 0, label: '01', sortOrder: 0, active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, createdBy: 'admin-a'
    });
    await assertSucceeds(structure.commit());
    await assertFails(setDoc(doc(db, `${workspace}/doors/door-fake-location`), {
      buildingId: 'building-member', zoneId: 'zone-a', location: new GeoPoint(43.7, 1.5), geohash: 'spc01',
      floor: 0, label: '02', sortOrder: 1, active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, createdBy: 'admin-a'
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
      lastVisitAt: Timestamp.fromDate(new Date('2026-07-29T12:00:00Z')),
      updatedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
  });

  it('refuses a door whose ancienneté does not come from its own passage', async () => {
    await seed();
    const db = member('member-a');
    const forged = writeBatch(db);
    forged.set(doc(db, `${workspace}/visits/visit-forged-date`), visitData());
    forged.update(doc(db, `${workspace}/doors/door-a`), {
      currentStatusId: 'contacted',
      revision: 1,
      lastVisitId: 'visit-forged-date',
      // Antidatée pour se soustraire au seuil d'alerte de 90 jours.
      lastVisitAt: Timestamp.fromDate(new Date('2026-08-08T12:00:00Z')),
      updatedAt: serverTimestamp()
    });
    await assertFails(forged.commit());

    const undated = writeBatch(db);
    undated.set(doc(db, `${workspace}/visits/visit-undated`), visitData());
    undated.update(doc(db, `${workspace}/doors/door-a`), {
      currentStatusId: 'contacted',
      revision: 1,
      lastVisitId: 'visit-undated',
      updatedAt: serverTimestamp()
    });
    await assertFails(undated.commit());
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

  it('lets a member toggle the sisters marker alone, and nothing else with it', async () => {
    await seed();
    const db = member('member-a');
    await assertSucceeds(updateDoc(doc(db, `${workspace}/doors/door-a`), {
      aConfierAuxSoeurs: true,
      updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(doc(db, `${workspace}/doors/door-a`), {
      aConfierAuxSoeurs: false,
      updatedAt: serverTimestamp()
    }));

    // Le marqueur ne doit servir de cheval de Troie ni au statut, ni à la révision.
    await assertFails(updateDoc(doc(db, `${workspace}/doors/door-a`), {
      aConfierAuxSoeurs: true,
      currentStatusId: 'contacted',
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(db, `${workspace}/doors/door-a`), {
      aConfierAuxSoeurs: true,
      revision: 1,
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(db, `${workspace}/doors/door-a`), {
      aConfierAuxSoeurs: 'oui',
      updatedAt: serverTimestamp()
    }));
  });

  it('refuses the sisters marker to an inactive member', async () => {
    await seed();
    await assertFails(updateDoc(doc(member('inactive-a'), `${workspace}/doors/door-a`), {
      aConfierAuxSoeurs: true,
      updatedAt: serverTimestamp()
    }));
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
      lastVisitAt: Timestamp.fromDate(new Date('2026-07-29T12:00:00Z')),
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
      lastVisitAt: Timestamp.fromDate(new Date('2026-07-29T12:00:00Z')),
      createdBy: 'member-a',
      updatedAt: serverTimestamp()
    });
    await assertFails(batch.commit());
  });
});
