import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { GeoPoint, Timestamp, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
let testEnv: RulesTestEnvironment;
const zoneId = 'zone-wp2';
const buildingId = 'RNB_WP2_RULES';

/** Le claim `role` vaut 'admin' ou 'member' : il n'existe aucune affectation de zone. */
function brother(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'member' }).firestore();
}

function coordinator(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'admin' }).firestore();
}

/** Compte authentifié sans claim `role` : inscrit, pas encore membre de l'effort. */
function stranger(uid: string) {
  return testEnv.authenticatedContext(uid, {}).firestore();
}

function polygon() {
  return {
    type: 'Polygon',
    vertices: [
      new GeoPoint(43.600, 1.439),
      new GeoPoint(43.600, 1.451),
      new GeoPoint(43.608, 1.451),
      new GeoPoint(43.600, 1.439)
    ]
  };
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `zones/${zoneId}`), {
      nom: 'Zone WP2', couleur: '#16324F', polygon: polygon(),
      createdBy: 'coord-a', createdAt: Timestamp.now(), stats: {}
    });
    await setDoc(doc(db, `buildings/${buildingId}`), {
      zoneId, rnbId: buildingId, adresse: '1 rue de test', complement: null,
      point: new GeoPoint(43.6, 1.44), source: 'rnb', niveaux: 1,
      createdBy: 'brother-a', createdAt: Timestamp.now(),
      derived: { statut: 'todo', dernierPassageAt: null, portesTotal: 1, portesFaites: 0, aConfierAuxSoeurs: false }
    });
    await setDoc(doc(db, `buildings/${buildingId}/doors/rdc-01`), {
      etage: 0, numero: '01', ordre: 0, foyer: null, aConfierAuxSoeurs: false,
      derived: { statut: 'todo', dernierPassageAt: null }
    });
  });
}

function passage(overrides: Record<string, unknown> = {}) {
  return {
    statut: 'away', note: null, auteurUid: 'brother-a', auteurNom: 'Frère A', at: Timestamp.now(), ...overrides
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'athar-wp2-rules', firestore: { host: '127.0.0.1', port: 8180, rules }
  });
});
afterEach(async () => { await testEnv.clearFirestore(); });
afterAll(async () => { await testEnv.cleanup(); });

/**
 * Lot A3.5 — le schéma racine historique n'est plus utilisé par l'application. Ses règles
 * reposaient sur le seul claim `role` : un compte suspendu dans le workspace, ou un compte
 * portant un claim forgé hors du parcours d'invitation, y lisait et écrivait encore. Le
 * chemin est désormais fermé à tout client, quel que soit le claim. Les documents restent.
 */
describe('Schéma racine historique — fermé aux clients', () => {
  it('refuse toute lecture, même à un coordinateur ou un frère portant un claim', async () => {
    await seed();
    for (const db of [coordinator('coord-a'), brother('brother-a'), stranger('stranger-a')]) {
      await assertFails(getDoc(doc(db, `zones/${zoneId}`)));
      await assertFails(getDoc(doc(db, `buildings/${buildingId}`)));
      await assertFails(getDoc(doc(db, `buildings/${buildingId}/doors/rdc-01`)));
    }
  });

  it('refuse toute écriture : bâtiment, porte, passage, zone', async () => {
    await seed();
    const db = brother('brother-a');
    await assertFails(setDoc(doc(db, `buildings/${buildingId}/doors/rdc-01/passages/p1`), passage()));
    await assertFails(updateDoc(doc(db, `buildings/${buildingId}/doors/rdc-01`), { foyer: 'femme', aConfierAuxSoeurs: true }));
    await assertFails(setDoc(doc(db, `buildings/RNB_NEW`), {
      zoneId, rnbId: 'RNB_NEW', adresse: '2 rue', complement: null, point: new GeoPoint(43.6, 1.44),
      source: 'rnb', niveaux: 1, createdBy: 'brother-a', createdAt: Timestamp.now()
    }));
    const admin = coordinator('coord-a');
    await assertFails(deleteDoc(doc(admin, `buildings/${buildingId}`)));
    await assertFails(updateDoc(doc(admin, `zones/${zoneId}`), { nom: 'Renommée' }));
    await assertFails(updateDoc(doc(admin, `buildings/${buildingId}`), { derived: deleteField() }));
  });

  it('laisse les documents existants intacts : la fermeture ne supprime rien', async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await assertSucceeds(getDoc(doc(context.firestore(), `buildings/${buildingId}/doors/rdc-01`)));
    });
  });
});
