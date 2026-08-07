import { createRequire } from 'node:module';
import { assertExplicitCloudApply, assertTargetProject } from './commissioning/guard.mjs';

const require = createRequire(import.meta.url);
const { getAccessToken, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const scopes = require('firebase-tools/lib/scopes');

const args = process.argv.slice(2);
const projectId = assertTargetProject(args);
const apiKey = process.env.ATHAR_FIREBASE_API_KEY;
const workspaceId = process.env.ATHAR_WORKSPACE_ID || 'main';
const username = process.env.ATHAR_MEMBER_USERNAME;
const displayName = process.env.ATHAR_MEMBER_DISPLAY_NAME;
const password = process.env.ATHAR_MEMBER_PASSWORD;

if (!args.includes('--apply')) {
  console.log(JSON.stringify({
    projectId,
    mode: 'dry-run',
    required: ['--apply', 'ATHAR_CONFIRM_PROJECT=athar-dev31', 'ATHAR_FIREBASE_API_KEY', 'ATHAR_MEMBER_USERNAME', 'ATHAR_MEMBER_DISPLAY_NAME', 'ATHAR_MEMBER_PASSWORD']
  }, null, 2));
  process.exit(0);
}

assertExplicitCloudApply(args);

if (!apiKey || !username || !displayName || !password) {
  throw new Error('Missing ATHAR_FIREBASE_API_KEY, ATHAR_MEMBER_USERNAME, ATHAR_MEMBER_DISPLAY_NAME or ATHAR_MEMBER_PASSWORD.');
}

const email = `${username}@auth.athar.invalid`;

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

async function cliBearer() {
  const account = getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error('Firebase CLI is not logged in.');
  const token = await getAccessToken(account.tokens.refresh_token, [
    scopes.EMAIL,
    scopes.OPENID,
    scopes.FIREBASE_PLATFORM,
    scopes.CLOUD_PLATFORM
  ]);
  return token.access_token;
}

function assertOk(call, label) {
  if (!call.ok) {
    const message = call.body?.error?.message || `HTTP ${call.status}`;
    throw new Error(`${label}: ${message}`);
  }
}

const bearer = await cliBearer();
const adminHeaders = {
  Authorization: `Bearer ${bearer}`,
  'x-goog-user-project': projectId
};

const lookup = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ email: [email] })
});
assertOk(lookup, 'Auth lookup failed');

let uid = lookup.body?.users?.[0]?.localId;
let authAction = 'updated';
if (uid) {
  const update = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ localId: uid, email, password, displayName, emailVerified: true, disableUser: false })
  });
  assertOk(update, 'Auth update failed');
} else {
  uid = `member-${username.replace(/[^a-z0-9]/g, '-')}`;
  const create = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ localId: uid, email, password, displayName, emailVerified: true, disabled: false })
  });
  assertOk(create, 'Auth creation failed');
  uid = create.body.localId;
  authAction = 'created';
}

const documentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/workspaces/${workspaceId}/members/${uid}`;
const existingMember = await jsonFetch(documentUrl, { headers: adminHeaders });
if (!existingMember.ok && existingMember.status !== 404) assertOk(existingMember, 'Member lookup failed');
const createdAt = existingMember.body?.fields?.createdAt?.timestampValue || new Date().toISOString();
const memberWrite = await jsonFetch(documentUrl, {
  method: 'PATCH',
  headers: adminHeaders,
  body: JSON.stringify({
    fields: {
      username: { stringValue: username },
      displayName: { stringValue: displayName },
      role: { stringValue: 'member' },
      active: { booleanValue: true },
      createdAt: { timestampValue: createdAt }
    }
  })
});
assertOk(memberWrite, 'Member write failed');

const signIn = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
  method: 'POST',
  body: JSON.stringify({ email, password, returnSecureToken: true })
});
assertOk(signIn, 'Credential verification failed');

const memberRead = await jsonFetch(documentUrl, {
  headers: { Authorization: `Bearer ${signIn.body.idToken}` }
});
assertOk(memberRead, 'Authenticated member read failed');

console.log(JSON.stringify({
  projectId,
  workspaceId,
  uid,
  username,
  authAction,
  memberActive: memberRead.body?.fields?.active?.booleanValue === true,
  credentialVerified: true
}, null, 2));
