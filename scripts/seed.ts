import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Ce peuplement est réservé à Firestore Emulator. Lancez d’abord les émulateurs.');
}

const projectId = process.env.GCLOUD_PROJECT ?? 'athar-local';
const app = getApps().find((candidate) => candidate.name === 'athar-wp2-seed')
  ?? initializeApp({ projectId }, 'athar-wp2-seed');
const db = getFirestore(app);
const createdAt = Timestamp.fromDate(new Date('2026-08-08T09:00:00.000Z'));
const zoneId = 'wp2-toulouse-test';
const buildingId = 'RNB_DEMO_TOULOUSE_WP2';
const buildingRef = db.doc(`buildings/${buildingId}`);

await db.doc(`zones/${zoneId}`).set({
  nom: 'Zone test Toulouse',
  couleur: '#16324F',
  polygon: {
    type: 'Polygon',
    // HYPOTHÈSE: WP2 ne stocke que l’anneau extérieur ; Firestore interdit les tableaux imbriqués du GeoJSON brut.
    vertices: [
      new GeoPoint(43.600, 1.439),
      new GeoPoint(43.600, 1.451),
      new GeoPoint(43.608, 1.451),
      new GeoPoint(43.600, 1.439)
    ]
  },
  createdBy: 'seed-wp2',
  createdAt,
  stats: { batimentsDetectes: 1, batimentsTouches: 1, portesFaites: 1, portesTotal: 2, majAt: createdAt }
});

await buildingRef.set({
  zoneId,
  rnbId: buildingId,
  adresse: '1 rue de la Trace, Toulouse',
  complement: null,
  point: new GeoPoint(43.604, 1.445),
  source: 'rnb',
  niveaux: 1,
  createdBy: 'seed-wp2',
  createdAt
});

await buildingRef.collection('doors').doc('rdc-01').set({
  etage: 0,
  numero: '01',
  ordre: 0,
  foyer: null,
  aConfierAuxSoeurs: false
});
await buildingRef.collection('doors').doc('rdc-02').set({
  etage: 0,
  numero: '02',
  ordre: 1,
  foyer: null,
  aConfierAuxSoeurs: true
});
await buildingRef.collection('doors').doc('rdc-01').collection('passages').doc('seed-open').set({
  statut: 'open',
  note: 'Passage de démonstration.',
  auteurUid: 'seed-wp2',
  auteurNom: 'Seed WP2',
  at: createdAt
});

console.log(`Zone de test WP2 peuplée : ${zoneId}.`);
