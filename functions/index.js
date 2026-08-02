const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');

if (getApps().length === 0) initializeApp();

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const WORKSPACE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
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

exports.emulatorHealth = onRequest((request, response) => {
  response.status(200).json({ emulator: true, service: 'athar-functions' });
});

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
