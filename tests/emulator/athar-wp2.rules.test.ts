import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `zones/${zoneId}`), {
      nom: 'Zone WP2', couleur: '#16324F', polygon: { type: 'Polygon', coordinates: [] },
      createdBy: 'coord-a', createdAt: Timestamp.now(), stats: {}
    });
    await setDoc(doc(db, `buildings/${buildingId}`), {
      zoneId, rnbId: buildingId, adresse: '1 rue de test', complement: null,
      point: { latitude: 43.6, longitude: 1.44 }, source: 'rnb', niveaux: 1,
      createdBy: 'brother-a', createdAt: Timestamp.now()
    });
    await setDoc(doc(db, `buildings/${buildingId}/doors/rdc-01`), {
      etage: 0, numero: '01', ordre: 0, foyer: null, aConfierAuxSoeurs: false
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

describe('WP2 — règles append-only Athar', () => {
  it('autorise un passage de son auteur puis interdit sa mutation et sa suppression', async () => {
    await seed();
    const db = brother('brother-a');
    const passageRef = doc(db, `buildings/${buildingId}/doors/rdc-01/passages/passage-a`);
    await assertSucceeds(setDoc(passageRef, passage()));
    await assertFails(updateDoc(passageRef, { note: 'Correction interdite' }));
    await assertFails(deleteDoc(passageRef));
  });

  it('refuse un passage usurpant un autre auteur', async () => {
    await seed();
    await assertFails(setDoc(
      doc(brother('brother-a'), `buildings/${buildingId}/doors/rdc-01/passages/foreign-author`),
      passage({ auteurUid: 'brother-b' })
    ));
  });

  /*
   * Il n'y a pas de restriction territoriale : un frère agit partout. Ce qui protège
   * l'historique est l'immutabilité de `passages`, vérifiée ci-dessus, pas un périmètre.
   */
  it('laisse tout membre agir sur un bâtiment quelconque, sans affectation de zone', async () => {
    await seed();
    const db = brother('brother-b');
    await assertSucceeds(getDoc(doc(db, `buildings/${buildingId}`)));
    await assertSucceeds(getDoc(doc(db, `zones/${zoneId}`)));
    await assertSucceeds(setDoc(
      doc(db, `buildings/${buildingId}/doors/rdc-01/passages/passage-b`),
      passage({ auteurUid: 'brother-b', auteurNom: 'Frère B' })
    ));
  });

  it('ferme la porte à un compte authentifié sans claim de rôle', async () => {
    await seed();
    const db = stranger('inconnu-a');
    await assertFails(getDoc(doc(db, `buildings/${buildingId}`)));
    await assertFails(setDoc(
      doc(db, `buildings/${buildingId}/doors/rdc-01/passages/passage-inconnu`),
      passage({ auteurUid: 'inconnu-a', auteurNom: 'Inconnu' })
    ));
  });

  it('réserve la création d’une zone au coordinateur', async () => {
    const data = {
      nom: 'Nouvelle zone', couleur: '#16324F', polygon: { type: 'Polygon', coordinates: [] },
      createdBy: 'coord-a', createdAt: Timestamp.now(), stats: {}
    };
    await assertFails(setDoc(doc(brother('brother-a'), 'zones/new-zone'), data));
    await assertSucceeds(setDoc(doc(coordinator('coord-a'), 'zones/new-zone'), data));
  });
});
