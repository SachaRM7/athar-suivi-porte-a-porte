import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
let testEnv: RulesTestEnvironment;
const zoneId = 'zone-wp2';
const buildingId = 'RNB_WP2_RULES';

function brother(uid: string, zones = [zoneId]) {
  return testEnv.authenticatedContext(uid, { zoneIds: zones }).firestore();
}

function coordinator(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'coordinator', zoneIds: [zoneId] }).firestore();
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
  it('autorise un passage de son auteur dans sa zone puis interdit sa mutation et sa suppression', async () => {
    await seed();
    const db = brother('brother-a');
    const passageRef = doc(db, `buildings/${buildingId}/doors/rdc-01/passages/passage-a`);
    await assertSucceeds(setDoc(passageRef, passage()));
    await assertFails(updateDoc(passageRef, { note: 'Correction interdite' }));
    await assertFails(deleteDoc(passageRef));
  });

  it('refuse un passage usurpant un autre auteur ou une zone non affectée', async () => {
    await seed();
    await assertFails(setDoc(
      doc(brother('brother-a'), `buildings/${buildingId}/doors/rdc-01/passages/foreign-author`),
      passage({ auteurUid: 'brother-b' })
    ));
    await assertFails(getDoc(doc(brother('brother-b', []), `buildings/${buildingId}`)));
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
