import { readFile } from 'node:fs/promises';
import { assertPhaseAProject, optionValue, writeCommissioningJson } from './guard.mjs';

const args = process.argv.slice(2);
const projectId = assertPhaseAProject(args);
const inventoryPath = optionValue(args, '--inventory');
if (!inventoryPath) throw new Error('Provide --inventory <path> to create a rollback plan.');

const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
if (inventory?.projectId !== projectId) throw new Error('Rollback inventory targets another project.');

const plan = {
  kind: 'athar-rollback-plan',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projectId,
  mode: 'dry-run',
  prerequisites: [
    'encrypted full Firestore backup before phase C',
    'Auth UID and custom-claim manifest before bootstrap',
    'current rules and index specification',
    'current Functions revisions',
    'current Hosting live release'
  ],
  rollbackOrder: [
    'disable newly-created Auth accounts',
    'restore claims and member documents',
    'restore Firestore documents or remove only recorded created IDs',
    'redeploy saved Firestore rules and index specification',
    'redeploy previous Functions revision if Functions was authorized',
    'promote previous Hosting release and recheck the service worker'
  ],
  sourceInventoryGeneratedAt: inventory.generatedAt
};

const output = await writeCommissioningJson(`rollback-plan-${Date.now()}.json`, plan);
console.log(JSON.stringify({ projectId, mode: plan.mode, output, rollbackSteps: plan.rollbackOrder.length }, null, 2));
