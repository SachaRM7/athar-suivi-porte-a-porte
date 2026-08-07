import { ATHAR_CLOUD_PROJECT, assertPhaseAProject, writeCommissioningJson } from './guard.mjs';
import { cliBearer, countWorkspaceCollection, firebaseReadSummary, readCloudSummary } from './cloud-read.mjs';

const args = process.argv.slice(2);
const projectId = assertPhaseAProject(args);
const collectionIds = ['members', 'statuses', 'zones', 'zoneStats', 'buildings', 'doors', 'visits'];

const cliCommands = [
  ['projects:list'],
  ['apps:list', 'WEB'],
  ['functions:list'],
  ['hosting:sites:list'],
  ['firestore:indexes', '--database', '(default)']
];

const cliResults = await Promise.all(cliCommands.map(async (command) => {
  const result = await firebaseReadSummary(projectId, command);
  return { command: command.join(' '), ok: result.ok, digest: result.digest ?? null, code: result.code ?? null };
}));

const summary = await readCloudSummary(projectId);
const bearer = await cliBearer();
const collections = Object.fromEntries(await Promise.all(collectionIds.map(async (collectionId) => [
  collectionId,
  await countWorkspaceCollection(projectId, bearer, collectionId)
])));

const report = {
  kind: 'athar-phase-a-cloud-inventory',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projectId: ATHAR_CLOUD_PROJECT,
  mode: 'read-only',
  cli: cliResults,
  cloud: summary,
  workspace: { id: 'main', collections }
};

const output = await writeCommissioningJson(`inventory-${Date.now()}.json`, report);
console.log(JSON.stringify({ projectId, mode: report.mode, output, authUsers: summary.authUsers?.count ?? null, collections }, null, 2));
