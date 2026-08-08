const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const crypto = require('node:crypto');

if (getApps().length === 0) initializeApp();

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const WORKSPACE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MAIN_WORKSPACE_ID = 'main';
const TECHNICAL_EMAIL_DOMAIN = '@auth.athar.invalid';
const REGISTERED_MEMBER_FIELDS = ['active', 'createdAt', 'displayName', 'role', 'uid', 'username', 'workspaceId'];

function normalizeUsername(value) {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Invalid username.');
  }
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpsError('invalid-argument', 'Invalid username.');
  }
  return username;
}

function normalizeWorkspaceId(value) {
  const workspaceId = String(value || '').trim();
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new HttpsError('invalid-argument', 'Invalid workspace identifier.');
  }
  return workspaceId;
}

function normalizeDisplayName(value) {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'A display name between 1 and 80 characters is required.');
  }
  const displayName = value.trim();
  if (displayName.length < 1 || displayName.length > 80) {
    throw new HttpsError('invalid-argument', 'A display name between 1 and 80 characters is required.');
  }
  return displayName;
}

function assertExactFields(data, fields) {
  const received = Object.keys(data || {}).sort().join(',');
  const expected = [...fields].sort().join(',');
  if (received !== expected) throw new HttpsError('invalid-argument', 'Unexpected request fields.');
}

function technicalEmailFor(username) {
  return `${username}${TECHNICAL_EMAIL_DOMAIN}`;
}

function isCanonicalRegisteredMember(data, expected) {
  if (!data || typeof data !== 'object') return false;
  const fields = Object.keys(data).sort();
  if (fields.length !== REGISTERED_MEMBER_FIELDS.length || fields.some((field, index) => field !== REGISTERED_MEMBER_FIELDS[index])) {
    return false;
  }
  return data.uid === expected.uid
    && data.username === expected.username
    && data.displayName === expected.displayName
    && data.workspaceId === MAIN_WORKSPACE_ID
    && data.role === 'member'
    && data.active === true
    && data.createdAt instanceof Timestamp;
}

function suppliedCodeHash(code) {
  if (typeof code !== 'string' || code.length < 1 || code.length > 512) {
    throw new HttpsError('invalid-argument', 'A bootstrap code is required.');
  }
  return crypto.createHash('sha256').update(code, 'utf8').digest();
}

function bootstrapHashBuffer(value) {
  if (typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  if (Buffer.isBuffer(value) && value.length === 32) return value;
  if (value?.toBuffer instanceof Function) {
    const buffer = value.toBuffer();
    if (buffer.length === 32) return buffer;
  }
  throw new HttpsError('failed-precondition', 'Initial administrator bootstrap is not provisioned correctly.');
}

exports.createMember = onCall(async (request) => {
  if (request.auth?.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required.');
  }

  const workspaceId = normalizeWorkspaceId(request.data?.workspaceId);
  const caller = await getFirestore().doc(`workspaces/${workspaceId}/members/${request.auth.uid}`).get();
  if (!caller.exists || caller.data().active !== true || caller.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Active workspace administrator required.');
  }

  const username = normalizeUsername(request.data?.username);
  const displayName = String(request.data?.displayName || '').trim();
  const password = String(request.data?.temporaryPassword || '');
  const fields = Object.keys(request.data || {}).sort().join(',');
  if (fields !== 'displayName,temporaryPassword,username,workspaceId' || displayName.length < 1 || displayName.length > 80 || password.length < 12 || password.length > 128) {
    throw new HttpsError('invalid-argument', 'Display name and a 12-character password are required.');
  }

  const user = await getAuth().createUser({
    email: `${username}@auth.athar.invalid`,
    displayName,
    password,
    disabled: false
  });
  try {
    await getFirestore().doc(`workspaces/${workspaceId}/members/${user.uid}`).set({
      username,
      displayName,
      role: 'member',
      active: true,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    await getAuth().deleteUser(user.uid);
    throw new HttpsError('internal', 'Member provisioning failed.', { cause: String(error) });
  }

  return { uid: user.uid, username };
});

exports.registerMember = onCall(async (request) => {
  if (!request.auth?.uid || !request.auth.token.email) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  assertExactFields(request.data, ['username', 'displayName']);
  const username = normalizeUsername(request.data.username);
  const displayName = normalizeDisplayName(request.data.displayName);
  const expectedEmail = technicalEmailFor(username);
  if (String(request.auth.token.email).toLowerCase() !== expectedEmail) {
    throw new HttpsError('permission-denied', 'Authenticated email does not match the username.');
  }

  const db = getFirestore();
  const memberRef = db.doc(`workspaces/${MAIN_WORKSPACE_ID}/members/${request.auth.uid}`);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(memberRef);
    if (existing.exists) {
      const data = existing.data();
      if (!isCanonicalRegisteredMember(data, { uid: request.auth.uid, username, displayName })) {
        throw new HttpsError('already-exists', 'This account already has a different or malformed member profile.');
      }
      return;
    }
    transaction.create(memberRef, {
      uid: request.auth.uid,
      username,
      displayName,
      workspaceId: MAIN_WORKSPACE_ID,
      role: 'member',
      active: true,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  const auth = getAuth();
  const user = await auth.getUser(request.auth.uid);
  if (user.displayName !== displayName) await auth.updateUser(request.auth.uid, { displayName });
  return { uid: request.auth.uid, username, workspaceId: MAIN_WORKSPACE_ID };
});

exports.claimInitialAdmin = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  assertExactFields(request.data, ['code']);
  const codeHash = suppliedCodeHash(request.data.code);
  const db = getFirestore();
  const memberRef = db.doc(`workspaces/${MAIN_WORKSPACE_ID}/members/${request.auth.uid}`);
  const bootstrapRef = db.doc(`workspaces/${MAIN_WORKSPACE_ID}/setup/admin-bootstrap`);
  const markerRef = db.doc(`workspaces/${MAIN_WORKSPACE_ID}/setup/initial-admin`);

  await db.runTransaction(async (transaction) => {
    const [member, bootstrap, marker] = await Promise.all([
      transaction.get(memberRef), transaction.get(bootstrapRef), transaction.get(markerRef)
    ]);
    if (!member.exists || member.data().active !== true) {
      throw new HttpsError('permission-denied', 'An active workspace member is required.');
    }
    if (!bootstrap.exists) throw new HttpsError('failed-precondition', 'Initial administrator bootstrap is not provisioned.');
    const bootstrapData = bootstrap.data();
    const storedHash = bootstrapHashBuffer(bootstrapData.codeHash);
    if (!crypto.timingSafeEqual(codeHash, storedHash)) {
      throw new HttpsError('permission-denied', 'Invalid bootstrap code.');
    }
    if (marker.exists) {
      if (marker.data().uid !== request.auth.uid || member.data().role !== 'admin') {
        throw new HttpsError('already-exists', 'An initial administrator already exists.');
      }
      return;
    }
    if (bootstrapData.consumedAt || bootstrapData.consumedBy) {
      throw new HttpsError('failed-precondition', 'Initial administrator bootstrap was already consumed.');
    }
    transaction.update(bootstrapRef, { consumedAt: FieldValue.serverTimestamp(), consumedBy: request.auth.uid });
    transaction.create(markerRef, { uid: request.auth.uid, createdAt: FieldValue.serverTimestamp() });
    transaction.update(memberRef, { role: 'admin' });
  });

  try {
    const auth = getAuth();
    const user = await auth.getUser(request.auth.uid);
    await auth.setCustomUserClaims(request.auth.uid, { ...(user.customClaims || {}), role: 'admin' });
  } catch {
    throw new HttpsError('internal', 'Administrator promotion is recorded; retry activation to repair the authentication claim.');
  }
  return { role: 'admin', workspaceId: MAIN_WORKSPACE_ID };
});

const ATHAR_STATUS_PRIORITY = Object.freeze({ linked: 5, open: 4, away: 3, locked: 2, dnd: 1, todo: 0 });

function isFirestoreTimestamp(value) {
  return value != null && typeof value.toMillis === 'function';
}

function latestTimestamp(left, right) {
  if (!isFirestoreTimestamp(left)) return isFirestoreTimestamp(right) ? right : null;
  if (!isFirestoreTimestamp(right)) return left;
  return left.toMillis() >= right.toMillis() ? left : right;
}

function dominantAtharStatus(statuses) {
  return statuses.reduce((dominant, status) => (
    (ATHAR_STATUS_PRIORITY[status] ?? 0) > (ATHAR_STATUS_PRIORITY[dominant] ?? 0) ? status : dominant
  ), 'todo');
}

async function recomputeAtharBuilding(buildingId) {
  const db = getFirestore();
  const buildingRef = db.doc(`buildings/${buildingId}`);
  const [building, doors] = await Promise.all([buildingRef.get(), buildingRef.collection('doors').get()]);
  if (!building.exists) return;

  let latest = null;
  let sisters = false;
  const statuses = [];
  let completed = 0;
  for (const door of doors.docs) {
    const data = door.data();
    const status = data.derived?.statut || 'todo';
    statuses.push(status);
    if (status !== 'todo') completed += 1;
    latest = latestTimestamp(latest, data.derived?.dernierPassageAt);
    sisters ||= data.aConfierAuxSoeurs === true;
  }

  await buildingRef.set({
    derived: {
      statut: dominantAtharStatus(statuses),
      dernierPassageAt: latest,
      portesTotal: doors.size,
      portesFaites: completed,
      aConfierAuxSoeurs: sisters
    }
  }, { merge: true });
}

exports.deriveAtharPassage = onDocumentCreated('buildings/{buildingId}/doors/{doorId}/passages/{passageId}', async (event) => {
  const passage = event.data?.data();
  if (!passage || !isFirestoreTimestamp(passage.at)) return;
  const db = getFirestore();
  const doorRef = db.doc(`buildings/${event.params.buildingId}/doors/${event.params.doorId}`);

  await db.runTransaction(async (transaction) => {
    const door = await transaction.get(doorRef);
    if (!door.exists) return;
    const existing = door.data().derived?.dernierPassageAt;
    if (!isFirestoreTimestamp(existing) || passage.at.toMillis() >= existing.toMillis()) {
      transaction.set(doorRef, {
        derived: { statut: passage.statut, dernierPassageAt: passage.at }
      }, { merge: true });
    }
  });
  await recomputeAtharBuilding(event.params.buildingId);
});

exports.deriveAtharSistersMarker = onDocumentWritten('buildings/{buildingId}/doors/{doorId}', async (event) => {
  const before = event.data?.before;
  const after = event.data?.after;
  if (before?.exists && after?.exists && before.data().aConfierAuxSoeurs === after.data().aConfierAuxSoeurs) return;
  await recomputeAtharBuilding(event.params.buildingId);
});
