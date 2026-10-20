import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, GeoPoint, getDoc, getDocs, collection, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

/**
 * Lot A3.6 — matrice de permissions par opération, imposée par les règles et non par les
 * boutons. Voir `docs/audits/LOT-A-FIABILITE-SECURITE.md` pour la matrice complète.
 */
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
const workspace = 'workspaces/main';
let testEnv: RulesTestEnvironment;

type Actor = 'anonymous' | 'no-profile' | 'suspended' | 'member' | 'admin';

function db(actor: Actor): Firestore {
  if (actor === 'anonymous') return testEnv.unauthenticatedContext().firestore();
  // Le compte suspendu garde un ancien claim administrateur : il ne doit plus rien ouvrir.
  if (actor === 'suspended') return testEnv.authenticatedContext('suspended-a', { role: 'admin' }).firestore();
  if (actor === 'no-profile') return testEnv.authenticatedContext('stranger-a', { role: 'member' }).firestore();
  if (actor === 'admin') return testEnv.authenticatedContext('admin-a', { role: 'admin' }).firestore();
  return testEnv.authenticatedContext('member-a').firestore();
}

const uidOf: Record<Actor, string> = { anonymous: 'anonymous', 'no-profile': 'stranger-a', suspended: 'suspended-a', member: 'member-a', admin: 'admin-a' };

function memberDoc(role: 'admin' | 'member', active = true) {
  return { username: `user-${role}`, displayName: 'Compte', role, active, createdAt: Timestamp.now() };
}

const location = new GeoPoint(43.61, 1.44);

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const store = context.firestore();
    await setDoc(doc(store, `${workspace}/members/admin-a`), memberDoc('admin'));
    await setDoc(doc(store, `${workspace}/members/member-a`), memberDoc('member'));
    await setDoc(doc(store, `${workspace}/members/suspended-a`), memberDoc('admin', false));
    await setDoc(doc(store, `${workspace}/statuses/unvisited`), { label: 'Pas encore fait', color: '#8B948F', order: 0, active: true });
    await setDoc(doc(store, `${workspace}/statuses/retry`), { label: 'Absent', color: '#C87A0A', order: 2, active: true });
    await setDoc(doc(store, `${workspace}/zones/zone-a`), {
      name: 'Zone A', color: '#16835F', coverageState: 'prepared', assigneeLabel: null,
      bbox: { north: 43.62, south: 43.60, east: 1.45, west: 1.43 },
      geometry: { type: 'Polygon', vertices: [
        { latitude: 43.60, longitude: 1.43 }, { latitude: 43.60, longitude: 1.45 },
        { latitude: 43.62, longitude: 1.45 }, { latitude: 43.60, longitude: 1.43 }
      ] }
    });
    await setDoc(doc(store, `${workspace}/buildings/building-a`), {
      addressLabel: '18 rue de test', location, geohash: 'spc00', zoneId: 'zone-a', createdBy: 'admin-a', structureRevision: 0
    });
    const door = { buildingId: 'building-a', zoneId: 'zone-a', location, geohash: 'spc00', floor: 0, sortOrder: 0, active: true, createdBy: 'admin-a', currentStatusId: 'unvisited', revision: 0, lastVisitId: null };
    await setDoc(doc(store, `${workspace}/doors/door-a`), { ...door, label: '01' });
    await setDoc(doc(store, `${workspace}/doors/door-visited`), { ...door, label: '02', sortOrder: 1, currentStatusId: 'retry', revision: 1, lastVisitId: 'visit-old', lastVisitAt: Timestamp.fromDate(new Date('2026-01-01T10:00:00Z')) });
    await setDoc(doc(store, `${workspace}/visits/visit-old`), {
      doorId: 'door-visited', statusId: 'retry', note: '', authorId: 'admin-a',
      occurredAt: Timestamp.fromDate(new Date('2026-01-01T10:00:00Z')), syncedAt: Timestamp.now(), doorRevision: 1
    });
  });
}

function recordVisit(store: Firestore, author: string, visitId = 'visit-new') {
  const batch = writeBatch(store);
  const occurredAt = Timestamp.fromDate(new Date('2026-08-01T10:00:00Z'));
  batch.set(doc(store, `${workspace}/visits/${visitId}`), {
    doorId: 'door-a', statusId: 'retry', note: '', authorId: author, occurredAt, syncedAt: serverTimestamp(), doorRevision: 1
  });
  batch.update(doc(store, `${workspace}/doors/door-a`), { currentStatusId: 'retry', revision: 1, lastVisitId: visitId, lastVisitAt: occurredAt, updatedAt: serverTimestamp() });
  return batch.commit();
}

const outsiders: Actor[] = ['anonymous', 'no-profile', 'suspended'];

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId: 'athar-permissions', firestore: { host: '127.0.0.1', port: 8180, rules } });
});
afterEach(async () => { await testEnv.clearFirestore(); });
afterAll(async () => { await testEnv.cleanup(); });

describe('Matrice de permissions — comptes non autorisés', () => {
  it('ne laisse ni lire ni écrire les données métier sans membre actif', async () => {
    await seed();
    for (const actor of outsiders) {
      const store = db(actor);
      await assertFails(getDoc(doc(store, `${workspace}/buildings/building-a`)));
      await assertFails(getDocs(collection(store, `${workspace}/doors`)));
      await assertFails(getDocs(collection(store, `${workspace}/visits`)));
      await assertFails(getDoc(doc(store, `${workspace}/zones/zone-a`)));
      await assertFails(recordVisit(store, uidOf[actor]));
      await assertFails(updateDoc(doc(store, `${workspace}/doors/door-a`), { foyer: 'femme', aConfierAuxSoeurs: true, updatedAt: serverTimestamp() }));
    }
  });

  it('refuse l’auto-inscription et toute élévation de privilèges côté client', async () => {
    await seed();
    await assertFails(setDoc(doc(db('no-profile'), `${workspace}/members/stranger-a`), memberDoc('member')));
    await assertFails(updateDoc(doc(db('member'), `${workspace}/members/member-a`), { role: 'admin' }));
    await assertFails(updateDoc(doc(db('suspended'), `${workspace}/members/suspended-a`), { active: true }));
    await assertFails(updateDoc(doc(db('admin'), `${workspace}/members/member-a`), { role: 'admin' }));
    await assertFails(setDoc(doc(db('member'), `${workspace}/setup/initial-admin`), { uid: 'member-a' }));
  });

  it('laisse un compte lire son propre profil, et seulement le sien, pour afficher son état d’accès', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(db('suspended'), `${workspace}/members/suspended-a`)));
    await assertFails(getDoc(doc(db('suspended'), `${workspace}/members/member-a`)));
    await assertFails(getDoc(doc(db('no-profile'), `${workspace}/members/member-a`)));
  });
});

describe('Matrice de permissions — membre actif', () => {
  it('conserve les gestes de terrain : lecture, passage, composition du foyer, marqueur sœurs', async () => {
    await seed();
    const store = db('member');
    await assertSucceeds(getDoc(doc(store, `${workspace}/buildings/building-a`)));
    await assertSucceeds(recordVisit(store, 'member-a'));
    await assertSucceeds(updateDoc(doc(store, `${workspace}/doors/door-visited`), { foyer: 'femme', aConfierAuxSoeurs: true, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(store, `${workspace}/doors/door-visited`), { foyer: 'femme', aConfierAuxSoeurs: false, updatedAt: serverTimestamp() }));
  });

  it('peut décrire un nouveau bâtiment et y ajouter des portes', async () => {
    await seed();
    const store = db('member');
    await assertSucceeds(setDoc(doc(store, `${workspace}/buildings/building-new`), {
      addressLabel: '2 rue nouvelle', location, geohash: 'spc00', zoneId: 'zone-a', createdBy: 'member-a', structureRevision: 0
    }));
    const batch = writeBatch(store);
    batch.update(doc(store, `${workspace}/buildings/building-new`), { structureRevision: 1, updatedAt: serverTimestamp() });
    batch.set(doc(store, `${workspace}/doors/door-new`), {
      buildingId: 'building-new', zoneId: 'zone-a', location, geohash: 'spc00', floor: 0, label: '01', sortOrder: 0,
      active: true, createdBy: 'member-a', currentStatusId: 'unvisited', revision: 0, lastVisitId: null
    });
    await assertSucceeds(batch.commit());
  });

  it('n’efface ni ne détourne : pas d’archivage de porte visitée, de suppression, de déplacement ni de zone', async () => {
    await seed();
    const store = db('member');
    const archive = writeBatch(store);
    archive.update(doc(store, `${workspace}/buildings/building-a`), { structureRevision: 1, updatedAt: serverTimestamp() });
    archive.update(doc(store, `${workspace}/doors/door-visited`), { active: false, updatedAt: serverTimestamp() });
    await assertFails(archive.commit());
    await assertFails(deleteDoc(doc(store, `${workspace}/doors/door-a`)));
    await assertFails(deleteDoc(doc(store, `${workspace}/buildings/building-a`)));
    await assertFails(deleteDoc(doc(store, `${workspace}/visits/visit-old`)));
    await assertFails(updateDoc(doc(store, `${workspace}/visits/visit-old`), { statusId: 'contacted' }));
    await assertFails(updateDoc(doc(store, `${workspace}/buildings/building-a`), { location: new GeoPoint(43.7, 1.5), geohash: 'spc11', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(store, `${workspace}/zones/zone-a`), { name: 'Renommée' }));
    await assertFails(recordVisit(store, 'admin-a', 'visit-forged'));
  });
});

describe('Matrice de permissions — administrateur actif', () => {
  it('garde les opérations de coordination', async () => {
    await seed();
    const store = db('admin');
    await assertSucceeds(updateDoc(doc(store, `${workspace}/buildings/building-a`), { addressLabel: '18 bis rue de test', updatedAt: serverTimestamp() }));
    const archive = writeBatch(store);
    archive.update(doc(store, `${workspace}/buildings/building-a`), { structureRevision: 1, updatedAt: serverTimestamp() });
    archive.update(doc(store, `${workspace}/doors/door-visited`), { active: false, updatedAt: serverTimestamp() });
    await assertSucceeds(archive.commit());
    await assertSucceeds(deleteDoc(doc(store, `${workspace}/zones/zone-a`)));
  });
});
