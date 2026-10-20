import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseErrors, publishRelease } from './release-contract.mjs';
const hash = 'a'.repeat(64);
const expected = { project: 'athar-test', commit: 'commit', rulesSha256: hash, functionsSha256: hash, indexesSha256: hash, productionFunctions: ['createMember'] };
const receipt = { ...expected, state: 'verified', functionsRevision: 'revision' };
const live = { project: expected.project, rulesSha256: hash, functions: ['createMember'], functionsRevision: 'revision', indexesReady: true };
test('rejects missing and partially deployed backend', () => {
  assert.ok(releaseErrors(expected, null, live).length);
  assert.ok(releaseErrors(expected, { state: 'deploying' }, live).length);
});
test('blocks wrong project, rules drift, functions drift, exposed onboarding, and building indexes', () => {
  for (const patch of [{ project: 'other' }, { rulesSha256: 'b'.repeat(64) }, { functionsRevision: 'other' }, { functions: ['createMember', 'registerMember'] }, { indexesReady: false }]) {
    assert.ok(releaseErrors(expected, receipt, { ...live, ...patch }).length);
  }
  for (const key of ['rulesSha256','functionsSha256','indexesSha256']) assert.ok(releaseErrors(expected, { ...receipt, [key]: null }, live).length);
  assert.deepEqual(releaseErrors(expected, receipt, live), []);
});
test('hosting-only never writes backend and waits for verified evidence', async () => {
  const calls = [];
  await publishRelease({ expected, includeBackend: false, inspectBackend: async () => live, readReceipt: async () => receipt, writeReceipt: async () => calls.push('write'), deployBackend: async () => calls.push('backend'), deployHosting: async () => calls.push('hosting') });
  assert.deepEqual(calls, ['hosting']);
});
test('partial backend failure cannot advance the receipt or publish Hosting', async () => {
  const calls = [];
  await assert.rejects(publishRelease({ expected, includeBackend: true, writeReceipt: async r => calls.push(r.state), deployBackend: async () => { throw new Error('failure'); }, deployHosting: async () => calls.push('hosting') }));
  assert.deepEqual(calls, ['deploying']);
});
test('explicit backend publication verifies active state before receipt and Hosting', async () => {
  const calls = []; let saved;
  await publishRelease({ expected, includeBackend: true, writeReceipt: async r => { calls.push(r.state); saved = r; }, deployBackend: async () => calls.push('backend'), inspectBackend: async () => { calls.push('inspect'); return live; }, readReceipt: async () => saved, deployHosting: async () => calls.push('hosting') });
  assert.deepEqual(calls, ['deploying', 'backend', 'inspect', 'verified', 'inspect', 'hosting']);
});

test('requires every declared index and validates implicit document ordering as well as readiness', async () => {
  const { declaredIndexesReady } = await import('./release-contract.mjs');
  const index = { collectionGroup: 'outings', queryScope: 'COLLECTION', fields: [{ fieldPath: 'startedAt', order: 'DESCENDING' }] };
  const actual = { name: 'projects/test/databases/(default)/collectionGroups/outings/indexes/1', queryScope: 'COLLECTION', state: 'READY', fields: [{ order: 'DESCENDING', fieldPath: 'startedAt' },{ order: 'DESCENDING', fieldPath: '__name__' }] };
  assert.equal(declaredIndexesReady([index],[actual]), true);
  assert.equal(declaredIndexesReady([index],[]), false);
  assert.equal(declaredIndexesReady([index],[{ ...actual, state:'CREATING' }]), false);
  assert.equal(declaredIndexesReady([index],[{ ...actual, fields:[actual.fields[0],{ fieldPath:'__name__',order:'ASCENDING' }] }]), false);
});
