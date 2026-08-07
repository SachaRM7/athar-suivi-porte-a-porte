import { readFile } from 'node:fs/promises';
import { assertPhaseAProject, optionValue, writeCommissioningJson } from './guard.mjs';

const args = process.argv.slice(2);
const projectId = assertPhaseAProject(args);
const inventoryPath = optionValue(args, '--inventory');

if (!inventoryPath) {
  console.log(JSON.stringify({
    projectId,
    mode: 'dry-run',
    requiredInput: '--inventory <redacted phase-A inventory>',
    backupScope: ['Auth summary', 'Firestore configuration', 'collection counts', 'rules/index/functions/hosting release references'],
    excludedFromPhaseA: ['raw Firestore document contents', 'password hashes', 'notes']
  }, null, 2));
  process.exit(0);
}

const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
if (inventory?.projectId !== projectId || inventory?.mode !== 'read-only') {
  throw new Error('Backup input must be a redacted read-only inventory for athar-dev31.');
}

const backup = {
  kind: 'athar-redacted-logical-backup',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projectId,
  sourceInventoryGeneratedAt: inventory.generatedAt,
  auth: inventory.cloud?.auth ?? null,
  firestore: inventory.cloud?.firestore ?? null,
  authUsers: inventory.cloud?.authUsers ?? null,
  workspace: inventory.workspace ?? null,
  cli: inventory.cli ?? [],
  excludes: ['passwords', 'tokens', 'service account keys', 'notes', 'raw document field values'],
  restoreGate: 'A full encrypted document backup is required immediately before phase C writes.'
};

const output = await writeCommissioningJson(`backup-redacted-${Date.now()}.json`, backup);
console.log(JSON.stringify({ projectId, mode: 'local-backup', output, collections: backup.workspace?.collections ?? {} }, null, 2));
