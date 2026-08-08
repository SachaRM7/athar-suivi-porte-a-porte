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

describe('WP2 — règles append-only Athar', () => {
  it('autorise un passage de son auteur puis interdit sa mutation et sa suppression', async () => {
    await seed();
    const db = brother('brother-a');
    const passageRef = doc(db, `buildings/${buildingId}/doors/rdc-01/passages/passage-a`);
    await assertSucceeds(setDoc(passageRef, passage()));
    await assertFails(updateDoc(passageRef, { note: 'Correction interdite' }));
    await assertFails(deleteDoc(passageRef));
    await assertFails(deleteDoc(doc(coordinator('coord-a'), passageRef.path)));
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

  it('interdit au client de modifier ou supprimer les champs dérivés', async () => {
    await seed();
    const db = brother('brother-a');
    const buildingRef = doc(db, `buildings/${buildingId}`);
    const doorRef = doc(db, `buildings/${buildingId}/doors/rdc-01`);
    await assertFails(updateDoc(buildingRef, { 'derived.statut': 'linked' }));
    await assertFails(updateDoc(buildingRef, { derived: deleteField() }));
    await assertFails(updateDoc(doorRef, { 'derived.statut': 'linked' }));
    await assertFails(updateDoc(doorRef, { derived: deleteField() }));
  });

  it('fige l’identité du bâtiment et refuse les sous-documents orphelins', async () => {
    await seed();
    const db = brother('brother-a');
    const buildingRef = doc(db, `buildings/${buildingId}`);
    await assertSucceeds(updateDoc(buildingRef, { adresse: '2 rue de test' }));
    await assertFails(updateDoc(buildingRef, { rnbId: 'RNB_USURPE' }));
    await assertFails(updateDoc(buildingRef, { createdBy: 'brother-b' }));

    await assertFails(setDoc(doc(db, 'buildings/ABSENT/doors/rdc-01'), {
      etage: 0, numero: '01', ordre: 0, foyer: null, aConfierAuxSoeurs: false
    }));
    await assertFails(setDoc(
      doc(db, `buildings/${buildingId}/doors/absente/passages/orphelin`),
      passage()
    ));
  });

  it('réserve la création d’une zone au coordinateur', async () => {
    const data = {
      nom: 'Nouvelle zone', couleur: '#16324F', polygon: polygon(),
      createdBy: 'coord-a', createdAt: Timestamp.now(), stats: {}
    };
    await assertFails(setDoc(doc(brother('brother-a'), 'zones/new-zone'), data));
    await assertSucceeds(setDoc(doc(coordinator('coord-a'), 'zones/new-zone'), data));
    await assertFails(setDoc(doc(coordinator('coord-a'), 'zones/spoofed-zone'), { ...data, createdBy: 'other-admin' }));
  });
});
