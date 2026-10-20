/** Explicit manual workflow only. This file is never run by PR/push verification. */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { declaredIndexesReady, publishRelease } from './release-contract.mjs';

if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.ATHAR_PUBLISH !== 'true') {
  throw new Error('Publication réservée au lancement manuel explicite sur main.');
}
const expected = JSON.parse(readFileSync('dist/athar-release.json', 'utf8'));
if (expected.project !== 'athar-dev31' || expected.commit !== process.env.GITHUB_SHA) throw new Error('Build ou projet non conforme au lancement.');
const serviceAccount = JSON.parse(process.env.ATHAR_FIREBASE_SERVICE_ACCOUNT ?? '{}');
if (serviceAccount.project_id !== expected.project) throw new Error('Compte de publication associé à un autre projet.');
const credential = cert(serviceAccount);
const app = initializeApp({ credential, projectId: expected.project });
const receiptRef = getFirestore(app).doc('deployment/backend');
const temporary = mkdtempSync(join(tmpdir(), 'athar-release-'));
const credentialsPath = join(temporary, 'credentials.json');
writeFileSync(credentialsPath, JSON.stringify(serviceAccount), { mode: 0o600 });
const sha = value => createHash('sha256').update(value).digest('hex');
const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')).indexes;
async function api(url) {
  const token = await credential.getAccessToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Inspection backend refusée (${response.status}).`);
  return response.json();
}
function deploy(only) {
  // No --force: removing functions/indexes needs a separate reviewed operation.
  execFileSync(process.execPath, ['node_modules/firebase-tools/lib/bin/firebase.js', 'deploy', '--only', only, '--project', expected.project, '--non-interactive'], {
    stdio: 'inherit', env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: credentialsPath }
  });
}
async function inspectBackend() {
  const project = encodeURIComponent(expected.project);
  const [release, functions, indexList] = await Promise.all([
    api(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`),
    api(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions?pageSize=1000`),
    api(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes?pageSize=1000`)
  ]);
  if (functions.nextPageToken || indexList.nextPageToken) throw new Error('Inventaire backend incomplet.');
  const ruleset = await api(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  const files = ruleset.source?.files;
  if (files?.length !== 1) throw new Error('Règles publiées non reconnues.');
  const deployed = functions.functions ?? [];
  const indexesReady = declaredIndexesReady(indexes, indexList.indexes ?? []);
  if (deployed.some(fn => fn.state !== 'ACTIVE')) throw new Error('Une Function n’est pas active.');
  return { project: expected.project, rulesSha256: sha(files[0].content),
    functions: deployed.map(fn => fn.name.split('/').at(-1)),
    functionsRevision: sha(JSON.stringify(deployed.map(fn => [fn.name, fn.updateTime]).sort((a,b) => a[0].localeCompare(b[0])))), indexesReady };
}
try {
  await publishRelease({ expected, includeBackend: process.env.ATHAR_PUBLISH_BACKEND === 'true',
    deployBackend: async () => deploy('firestore:rules,firestore:indexes,functions'), inspectBackend,
    readReceipt: async () => (await receiptRef.get()).data(),
    writeReceipt: async receipt => { await receiptRef.set(receipt); },
    deployHosting: async () => deploy('hosting') });
  console.log('Publication cohérente terminée.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
