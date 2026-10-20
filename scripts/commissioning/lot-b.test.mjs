import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCatalogue, zoneCatalogue, contains } from '../carto/catalogue.mjs';
import { auditData } from './data-audit.mjs';
const feature = (id, x) => ({ properties: { rnb_id: id }, geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + .1, 0], [x + .1, .1], [x, 0]]] } });
const options = { sourceVersion: 'source', complete: true, extent: [-5, -5, 5, 5] };
const zone = { id: 'z', geometry: { coordinates: [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]] } };
test('multi-footprints and input ordering yield one stable RNB identity and version', () => {
  const a = makeCatalogue([feature('rnb', .2), feature('rnb', 0)], options);
  const b = makeCatalogue([feature('rnb', 0), feature('rnb', .2)], options);
  assert.deepEqual(a, b); assert.equal(a.entries.length, 1); assert.deepEqual(a.entries[0].point, [0, 0]);
});
test('boundaries included, overlapping zones independently counted, extent and demo stay incomplete', () => {
  const c = makeCatalogue([feature('a', 0), feature('b', 1), feature('c', 3)], options);
  assert.equal(contains([1, 0], zone.geometry.coordinates), true);
  assert.deepEqual(zoneCatalogue(c, zone).ids, ['a', 'b']);
  assert.equal(zoneCatalogue(c, { ...zone, id: 'overlap' }).detectedCount, 2);
  assert.equal(zoneCatalogue(makeCatalogue([feature('a', 0)], { ...options, complete: false }), zone).complete, false);
  assert.equal(zoneCatalogue(makeCatalogue([feature('a', 0)], { ...options, extent: [0, 0, 1, 1] }), zone).complete, false);
});
test('historical door IDs repeated across buildings get separate stable mappings; sensitive data excluded', () => {
  const docs = ['a', 'b'].flatMap(b => [{ path: `buildings/${b}/doors/01`, data: { foyer: 'SECRET', note: 'SECRET' } }, { path: `buildings/${b}/doors/01/passages/p`, data: { statut: 'dnd', at: '2026-01-01', by: 'SECRET' } }]);
  const a = auditData(docs, 'main'), b = auditData([...docs].reverse(), 'main');
  assert.deepEqual(a, b); assert.equal(new Set(a.migrationPlan.map(p => p.targetId)).size, 4);
  assert.equal(a.retirementAllowed, false); assert.equal(JSON.stringify(a).includes('SECRET'), false);
  assert.equal(a.migrationPlan.every(p => p.state === 'quarantined'), true);
});
test('orphans and duplicate paths prevent retirement', () => {
  const doc = { path: 'workspaces/main/visits/v', data: { doorId: 'missing' } };
  const result = auditData([doc, doc], 'main'); assert.equal(result.retirementAllowed, false);
  assert.ok(result.issues.some(i => i.code === 'duplicate-path')); assert.ok(result.issues.some(i => i.code === 'orphan-visit'));
});
