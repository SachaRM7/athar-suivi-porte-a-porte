import { assertPhaseAProject, optionValue, writeCommissioningJson } from './guard.mjs';

const args = process.argv.slice(2);
const projectId = assertPhaseAProject(args);
const uid = optionValue(args, '--uid');
const username = optionValue(args, '--username');
const displayName = optionValue(args, '--display-name');
if (!uid || !/^[A-Za-z0-9_-]{3,128}$/.test(uid)) throw new Error('Provide an explicit --uid without personal data.');
if (!username || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error('Provide a valid --username.');
if (!displayName || displayName.length > 80) throw new Error('Provide a --display-name up to 80 characters.');

const plan = {
  kind: 'athar-admin-bootstrap-plan',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projectId,
  workspaceId: 'main',
  mode: 'dry-run',
  proposedMutations: [
    { resource: `auth/users/${uid}`, change: 'set custom claim role=admin after read-before-write comparison' },
    { resource: `workspaces/main/members/${uid}`, change: 'create or update role=admin, active=true after exact UID comparison' }
  ],
  username,
  displayName
};

const output = await writeCommissioningJson(`admin-bootstrap-plan-${Date.now()}.json`, plan);
console.log(JSON.stringify({ projectId, mode: plan.mode, output, proposedMutations: plan.proposedMutations.length }, null, 2));
