import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getAccessToken, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const scopes = require('firebase-tools/lib/scopes');

const projectId = process.env.ATHAR_FIREBASE_PROJECT_ID;
const apiKey = process.env.ATHAR_FIREBASE_API_KEY;
const password = process.env.ATHAR_FIREBASE_PROOF_PASSWORD || 'Temporary-password-123';

if (!projectId || !apiKey) {
  console.error(
    'Missing ATHAR_FIREBASE_PROJECT_ID or ATHAR_FIREBASE_API_KEY. Example: ' +
      '$env:ATHAR_FIREBASE_PROJECT_ID="athar-dev31"; $env:ATHAR_FIREBASE_API_KEY="..."'
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const clientEmail = `athar-client-signup-${stamp}@auth.athar.invalid`;
const adminEmail = `athar-admin-create-${stamp}@auth.athar.invalid`;
const adminUid = `athar-admin-create-${stamp}`;
const deleteUid = `athar-client-delete-${stamp}`;
const deleteEmail = `athar-client-delete-${stamp}@auth.athar.invalid`;

async function jsonFetch(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    }
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  return { status: response.status, ok: response.ok, body };
}

function summarizeError(body) {
  return body?.error
    ? {
        code: body.error.code,
        message: body.error.message,
        status: body.error.status
      }
    : null;
}

function summarizeCall(call) {
  if (!call) return null;
  return {
    status: call.status,
    ok: call.ok,
    localId: call.body?.localId || null,
    error: summarizeError(call.body)
  };
}

async function getCliBearer() {
  const account = getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI is not logged in. Run: npx firebase login');
  }
  const token = await getAccessToken(account.tokens.refresh_token, [
    scopes.EMAIL,
    scopes.OPENID,
    scopes.CLOUD_PROJECTS_READONLY,
    scopes.FIREBASE_PLATFORM,
    scopes.CLOUD_PLATFORM
  ]);
  return token.access_token;
}

async function adminDeleteUsers(bearer, localIds) {
  const ids = [...new Set(localIds.filter(Boolean))];
  if (!ids.length) return null;
  return jsonFetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchDelete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'x-goog-user-project': projectId
    },
    body: JSON.stringify({ localIds: ids, force: true })
  });
}

const createdLocalIds = [];

async function main() {
  const bearer = await getCliBearer();

  const config = await jsonFetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'x-goog-user-project': projectId
    }
  });

  const clientSignup = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    body: JSON.stringify({ email: clientEmail, password, returnSecureToken: true })
  });
  if (clientSignup.body?.localId) createdLocalIds.push(clientSignup.body.localId);

  const adminCreate = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'x-goog-user-project': projectId
    },
    body: JSON.stringify({
      localId: adminUid,
      email: adminEmail,
      password,
      displayName: 'Athar Admin Proof',
      emailVerified: true,
      disabled: false
    })
  });
  if (adminCreate.body?.localId) createdLocalIds.push(adminCreate.body.localId);

  const adminDeleteCreate = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'x-goog-user-project': projectId
    },
    body: JSON.stringify({
      localId: deleteUid,
      email: deleteEmail,
      password,
      displayName: 'Athar Delete Proof',
      emailVerified: true,
      disabled: false
    })
  });
  if (adminDeleteCreate.body?.localId) createdLocalIds.push(adminDeleteCreate.body.localId);

  const signInForDelete = adminDeleteCreate.ok
    ? await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        body: JSON.stringify({ email: deleteEmail, password, returnSecureToken: true })
      })
    : null;

  const clientDelete = signInForDelete?.body?.idToken
    ? await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
        method: 'POST',
        body: JSON.stringify({ idToken: signInForDelete.body.idToken })
      })
    : null;

  if (clientDelete?.ok) {
    const index = createdLocalIds.indexOf(deleteUid);
    if (index >= 0) createdLocalIds.splice(index, 1);
  }

  const cleanup = await adminDeleteUsers(bearer, createdLocalIds);

  const result = {
    projectId,
    measuredAt: new Date().toISOString(),
    config: {
      status: config.status,
      ok: config.ok,
      emailPasswordEnabled: config.body?.signIn?.email?.enabled ?? null,
      passwordRequired: config.body?.signIn?.email?.passwordRequired ?? null,
      error: summarizeError(config.body)
    },
    clientSignup: summarizeCall(clientSignup),
    adminCreate: summarizeCall(adminCreate),
    clientDelete: summarizeCall(clientDelete),
    cleanup: cleanup && {
      status: cleanup.status,
      ok: cleanup.ok,
      errors: cleanup.body?.errors || null,
      error: summarizeError(cleanup.body)
    }
  };

  console.log(JSON.stringify(result, null, 2));

  const selfServiceClosed = !clientSignup.ok && !clientDelete?.ok;
  const adminWorks = adminCreate.ok;
  process.exitCode = selfServiceClosed && adminWorks ? 0 : 2;
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
