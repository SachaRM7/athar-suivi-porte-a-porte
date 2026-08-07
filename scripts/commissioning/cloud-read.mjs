import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { redactedError } from './guard.mjs';

const require = createRequire(import.meta.url);
const { getAccessToken, getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const scopes = require('firebase-tools/lib/scopes');
const execFileAsync = promisify(execFile);
const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase.js');

export async function cliBearer() {
  const account = getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI is not logged in. Run npx firebase login before the read-only inventory.');
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

export async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers ?? {}), 'Content-Type': 'application/json' }
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}

export async function firebaseRead(args) {
  const result = await execFileAsync(process.execPath, [firebaseCli, '--non-interactive', '--json', ...args], {
    cwd: process.cwd(),
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

function parseJsonOutput(output) {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

export async function firebaseReadSummary(projectId, command) {
  try {
    const output = await firebaseRead([...command, '--project', projectId]);
    return { ok: true, digest: createDigest(output.stdout), parsed: parseJsonOutput(output.stdout) };
  } catch (error) {
    return { ok: false, code: error.code ?? 'FIREBASE_CLI_READ_FAILED' };
  }
}

function createDigest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function readCloudSummary(projectId) {
  const bearer = await cliBearer();
  const headers = { Authorization: `Bearer ${bearer}`, 'x-goog-user-project': projectId };
  const [authConfig, database, authUsers, functions] = await Promise.all([
    jsonFetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, { headers }),
    jsonFetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`, { headers }),
    jsonFetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=1000`, { headers }),
    jsonFetch(`https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/-/functions`, { headers })
  ]);

  return {
    auth: authConfig.ok
      ? {
          status: authConfig.status,
          emailPasswordEnabled: authConfig.body?.signIn?.email?.enabled ?? null,
          passwordRequired: authConfig.body?.signIn?.email?.passwordRequired ?? null,
          authorizedDomains: Array.isArray(authConfig.body?.authorizedDomains) ? authConfig.body.authorizedDomains.sort() : []
        }
      : redactedError(authConfig),
    firestore: database.ok
      ? {
          status: database.status,
          locationId: database.body?.locationId ?? null,
          type: database.body?.type ?? null,
          concurrencyMode: database.body?.concurrencyMode ?? null,
          deleteProtectionState: database.body?.deleteProtectionState ?? null,
          pointInTimeRecoveryEnablement: database.body?.pointInTimeRecoveryEnablement ?? null
        }
      : redactedError(database),
    authUsers: authUsers.ok
      ? {
          status: authUsers.status,
          count: Array.isArray(authUsers.body?.users) ? authUsers.body.users.length : 0,
          disabledCount: Array.isArray(authUsers.body?.users) ? authUsers.body.users.filter((user) => user.disabled === true).length : 0,
          nextPage: Boolean(authUsers.body?.nextPageToken)
        }
      : redactedError(authUsers)
    ,
    functions: functions.ok
      ? {
          status: functions.status,
          count: Array.isArray(functions.body?.functions) ? functions.body.functions.length : 0,
          nextPage: Boolean(functions.body?.nextPageToken)
        }
      : redactedError(functions)
  };
}

export async function countWorkspaceCollection(projectId, bearer, collectionId) {
  const headers = { Authorization: `Bearer ${bearer}`, 'x-goog-user-project': projectId };
  const response = await jsonFetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/workspaces/main:runAggregationQuery`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery: { from: [{ collectionId }] },
          aggregations: [{ alias: 'documentCount', count: {} }]
        }
      })
    }
  );
  if (!response.ok) return redactedError(response);
  const rows = Array.isArray(response.body) ? response.body : [response.body];
  const count = rows.find((row) => row?.result?.aggregateFields?.documentCount)?.result?.aggregateFields?.documentCount?.integerValue;
  return { status: response.status, count: count === undefined ? null : Number(count) };
}
