/**
 * Lot A3.2 — preuve des deux configurations, sans émulateur ni cloud : on charge le module
 * dans un processus Node isolé avec un environnement donné, et on liste ses exports.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { localOnboardingEnabled } = require('../runtime-mode');

function exportedFunctions(extraEnv) {
  const env = { ...process.env, GCLOUD_PROJECT: 'athar-exports-test', FIREBASE_CONFIG: JSON.stringify({ projectId: 'athar-exports-test' }) };
  delete env.FUNCTIONS_EMULATOR;
  delete env.ATHAR_FUNCTIONS_MODE;
  Object.assign(env, extraEnv);
  const output = execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify(Object.keys(require("./index.js")).sort()))'], {
    cwd: path.join(__dirname, '..'),
    env
  });
  return JSON.parse(String(output).trim().split('\n').at(-1));
}

test('production: an absent variable never opens self-service registration', () => {
  assert.deepEqual(exportedFunctions({}), ['createMember']);
});

test('production: a misspelt or permissive mode still exports only createMember', () => {
  assert.deepEqual(exportedFunctions({ ATHAR_FUNCTIONS_MODE: 'local' }), ['createMember']);
  assert.deepEqual(exportedFunctions({ ATHAR_FUNCTIONS_MODE: '' }), ['createMember']);
});

test('emulator: local onboarding and bootstrap stay available for end-to-end tests', () => {
  assert.deepEqual(exportedFunctions({ FUNCTIONS_EMULATOR: 'true' }), [
    'claimInitialAdmin', 'createMember', 'deriveAtharPassage', 'deriveAtharSistersMarker', 'registerMember'
  ]);
});

test('emulator replaying production: onboarding is closed', () => {
  assert.deepEqual(exportedFunctions({ FUNCTIONS_EMULATOR: 'true', ATHAR_FUNCTIONS_MODE: 'production' }), ['createMember']);
});

test('the runtime guard follows the same rule', () => {
  assert.equal(localOnboardingEnabled({}), false);
  assert.equal(localOnboardingEnabled({ FUNCTIONS_EMULATOR: 'false' }), false);
  assert.equal(localOnboardingEnabled({ FUNCTIONS_EMULATOR: 'true' }), true);
  assert.equal(localOnboardingEnabled({ FUNCTIONS_EMULATOR: 'true', ATHAR_FUNCTIONS_MODE: 'production' }), false);
});
