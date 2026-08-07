import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { assertNoSensitiveKeys, assertPhaseAProject, assertTargetProject } from './guard.mjs';
import { validatePilotManifest } from './pilot-manifest.mjs';

assert.equal(assertPhaseAProject(['--project', 'athar-dev31']), 'athar-dev31');
assert.throws(() => assertPhaseAProject(['--project', 'athar-local']));
assert.throws(() => assertPhaseAProject(['--project', 'athar-dev31', '--apply']));
assert.throws(() => assertTargetProject(['--project', 'another-project']));
assert.throws(() => assertNoSensitiveKeys({ password: 'never' }));

const example = JSON.parse(await readFile(new URL('../fixtures/pilote-cloud.example.json', import.meta.url), 'utf8'));
assert.deepEqual(validatePilotManifest(example), {
  buildingCount: 0,
  doorCount: 0,
  statusIds: ['contacted', 'do-not-return', 'retry', 'unvisited']
});

const productionExports = execFileSync(process.execPath, ['-e', "console.log(Object.keys(require('./functions')).sort().join(','))"], {
  cwd: process.cwd(),
  encoding: 'utf8',
}).trim();
assert.equal(productionExports, 'createMember');
const functionsSource = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
assert.doesNotMatch(functionsSource, /emulatorHealth/);

console.log('Phase A commissioning guards and manifest validation passed.');
