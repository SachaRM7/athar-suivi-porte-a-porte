import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.GCLOUD_PROJECT = 'athar-local';

const app = initializeApp({ projectId: 'athar-local' }, 'athar-wp2-derivations');
const db = getFirestore(app);

async function eventually(assertion: () => Promise<void>, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let cause: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      cause = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw cause;
}

afterAll(async () => {
  await Promise.all(getApps().filter((candidate) => candidate.name === app.name).map(deleteApp));
});

describe('WP2 — Cloud Functions de dérivation Athar', () => {
  it('dérive la porte et le bâtiment au premier passage, puis au marqueur sœurs', async () => {
    const suffix = Date.now().toString(36);
    const buildingId = `RNB_DERIVATION_${suffix}`;
    const building = db.doc(`buildings/${buildingId}`);
    const occurredAt = Timestamp.fromDate(new Date('2026-08-08T10:00:00.000Z'));
    await building.set({
      zoneId: 'zone-wp2', rnbId: buildingId, adresse: '2 rue de test', complement: null,
      point: new GeoPoint(43.6, 1.44), source: 'rnb', niveaux: 1, createdBy: 'seed', createdAt: occurredAt
    });
    await building.collection('doors').doc('rdc-01').set({ etage: 0, numero: '01', ordre: 0, foyer: null, aConfierAuxSoeurs: false });
    await building.collection('doors').doc('rdc-02').set({ etage: 0, numero: '02', ordre: 1, foyer: null, aConfierAuxSoeurs: false });
    await building.collection('doors').doc('rdc-01').collection('passages').doc('first').set({
      statut: 'open', note: null, auteurUid: 'seed', auteurNom: 'Seed', at: occurredAt
    });

    await eventually(async () => {
      const [door, refreshed] = await Promise.all([building.collection('doors').doc('rdc-01').get(), building.get()]);
      expect(door.data()?.derived).toMatchObject({ statut: 'open', dernierPassageAt: occurredAt });
      expect(refreshed.data()?.derived).toMatchObject({ statut: 'open', portesTotal: 2, portesFaites: 1, aConfierAuxSoeurs: false });
    });

    await building.collection('doors').doc('rdc-02').update({ aConfierAuxSoeurs: true });
    await eventually(async () => {
      expect((await building.get()).data()?.derived?.aConfierAuxSoeurs).toBe(true);
    });
  });
});
