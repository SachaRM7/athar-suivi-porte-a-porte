import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { geohashForLocation } from 'geofire-common';
import { PILOTE_MINIMAL } from './fixtures/pilote-minimal.mjs';

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.GCLOUD_PROJECT = 'athar-local';

const app = initializeApp({ projectId: 'athar-local' }, 'athar-playwright-seed');
const auth = getAuth(app);
const db = getFirestore(app);
const workspace = db.doc(`workspaces/${PILOTE_MINIMAL.workspaceId}`);
const createdAt = Timestamp.fromDate(new Date(PILOTE_MINIMAL.createdAt));
const point = new GeoPoint(PILOTE_MINIMAL.building.latitude, PILOTE_MINIMAL.building.longitude);
const pointGeohash = geohashForLocation([PILOTE_MINIMAL.building.latitude, PILOTE_MINIMAL.building.longitude]);
const includeRegressionData = process.argv.includes('--with-regressions');
const bootstrapCode = process.env.ATHAR_E2E_BOOTSTRAP_CODE;

async function ensureUser(uid, username) {
  const email = `${username}@auth.athar.invalid`;
  try {
    await auth.createUser({ uid, email, password: PILOTE_MINIMAL.password });
  } catch (error) {
    if (error?.code !== 'auth/uid-already-exists' && error?.code !== 'auth/email-already-exists') throw error;
    await auth.updateUser(uid, { email, password: PILOTE_MINIMAL.password });
  }
}

await Promise.all(PILOTE_MINIMAL.users.map((user) => ensureUser(user.uid, user.username)));

const batch = db.batch();
for (const user of PILOTE_MINIMAL.users) {
  batch.set(workspace.collection('members').doc(user.uid), {
    username: user.username, displayName: user.displayName, role: user.role, active: true, createdAt
  });
}
for (const [id, label, color, order] of [
  ['unvisited', 'Pas visite', '#8C9494', 0],
  ['retry', 'A revenir', '#D8A200', 1],
  ['contacted', 'Contact', '#16835F', 2],
  ['do-not-return', 'Ne pas revenir', '#B8403B', 3]
]) {
  batch.set(workspace.collection('statuses').doc(id), { label, color, order, active: true });
}
batch.set(workspace.collection('zones').doc('carmes'), {
  name: 'Carmes', color: '#16835F', coverageState: 'active', assigneeLabel: 'Terrain 31',
  bbox: { north: 43.6089, south: 43.6039, east: 1.4518, west: 1.4418 },
  geometry: { type: 'Polygon', vertices: [
    { latitude: 43.6039, longitude: 1.4418 }, { latitude: 43.6039, longitude: 1.4518 },
    { latitude: 43.6089, longitude: 1.4518 }, { latitude: 43.6039, longitude: 1.4418 }
  ] }
});
if (includeRegressionData) {
  batch.set(workspace.collection('zones').doc('saint-cyprien'), {
    name: 'Saint-Cyprien', color: '#B8403B', coverageState: 'prepared', assigneeLabel: null,
    bbox: { north: 43.602, south: 43.598, east: 1.435, west: 1.428 },
    geometry: { type: 'Polygon', vertices: [
      { latitude: 43.598, longitude: 1.428 }, { latitude: 43.598, longitude: 1.435 },
      { latitude: 43.602, longitude: 1.435 }, { latitude: 43.598, longitude: 1.428 }
    ] }
  });
  batch.set(workspace.collection('zones').doc('pagination'), {
    name: 'Pagination', color: '#D8A200', coverageState: 'prepared', assigneeLabel: null,
    bbox: { north: 43.602, south: 43.598, east: 1.435, west: 1.428 },
    geometry: { type: 'Polygon', vertices: [
      { latitude: 43.598, longitude: 1.428 }, { latitude: 43.598, longitude: 1.435 },
      { latitude: 43.602, longitude: 1.435 }, { latitude: 43.598, longitude: 1.428 }
    ] }
  });
}
batch.set(workspace.collection('buildings').doc(PILOTE_MINIMAL.building.id), {
  addressLabel: PILOTE_MINIMAL.building.addressLabel, location: point, geohash: pointGeohash,
  zoneId: PILOTE_MINIMAL.building.zoneId, createdBy: 'admin-1', structureRevision: 0
});
batch.set(workspace.collection('zoneStats').doc('carmes'), {
  doorCount: 1, countsByStatus: { unvisited: 1, retry: 0, contacted: 0, 'do-not-return': 0 }, updatedAt: createdAt
});
if (includeRegressionData) {
  batch.set(workspace.collection('zoneStats').doc('saint-cyprien'), {
    doorCount: 'invalid', countsByStatus: {}, updatedAt: createdAt
  });
  batch.set(workspace.collection('zoneStats').doc('pagination'), {
    doorCount: 0, countsByStatus: { unvisited: 0, retry: 0, contacted: 0, 'do-not-return': 0 }, updatedAt: createdAt
  });
  for (let index = 0; index < 51; index += 1) {
    batch.set(workspace.collection('buildings').doc(`page-building-${String(index).padStart(3, '0')}`), {
      addressLabel: `${index} rue de pagination, Toulouse`, location: point, geohash: pointGeohash, zoneId: 'pagination', createdBy: 'admin-1', structureRevision: 0
    });
  }
}
batch.set(workspace.collection('doors').doc(PILOTE_MINIMAL.door.id), {
  buildingId: PILOTE_MINIMAL.building.id, zoneId: PILOTE_MINIMAL.building.zoneId, location: point, geohash: pointGeohash,
  floor: 0, label: PILOTE_MINIMAL.door.label, sortOrder: 1, active: true, currentStatusId: 'unvisited', revision: 0,
  lastVisitId: null, createdBy: 'admin-1'
});
if (bootstrapCode) {
  batch.set(workspace.collection('setup').doc('admin-bootstrap'), {
    codeHash: createHash('sha256').update(bootstrapCode, 'utf8').digest('hex'), createdAt
  });
}
await batch.commit();

console.log(includeRegressionData
  ? 'Emulator fixture pilote-minimal and regression datasets seeded.'
  : 'Emulator fixture pilote-minimal seeded.');
