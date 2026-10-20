const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeWorkspaceStats, catalogueDigest, geometryHash } = require('../stats-core');
function fixture() {
  const zone = { id: 'z', geometry: { vertices: [{ longitude: 0, latitude: 0 }, { longitude: 2, latitude: 0 }, { longitude: 2, latitude: 2 }, { longitude: 0, latitude: 0 }] } };
  const ids = Array.from({ length: 100 }, (_, i) => `rnb-${i}`);
  return { zones: [zone], buildings: [{ id: ids[0], zoneId: 'z' }],
    doors: [{ id: 'd', buildingId: ids[0], zoneId: 'z', active: true, currentStatusId: 'linked', revision: 1, lastVisitId: 'v', lastVisitAt: '2026-10-01T10:00:00.000Z' }],
    visits: [{ id: 'v', doorId: 'd', doorRevision: 1, statusId: 'linked', authorId: 'a', occurredAt: '2026-10-01T10:00:00.000Z', syncedAt: '2026-10-01T10:00:01.000Z' }],
    catalogues: [{ id: 'z', schemaVersion: 1, ids, complete: true, version: 'a'.repeat(64), geometryHash: geometryHash(zone), contentHash: catalogueDigest(ids), detectedCount: 100 }] };
}
const result = f => computeWorkspaceStats(f)[0];
test('100 detected, 1 visited is 1%; door progression and follow-up exclusions are independent', () => {
  const r = result(fixture()); assert.equal(r.geographicPercent, 1); assert.equal(r.descriptionPercent, 1);
  assert.equal(r.visitedDoorCount, 1); assert.equal(r.doorCount, 1); assert.equal(r.excludedDoorCount, 1); assert.equal(r.completeness, 'complete');
});
test('replays are deterministic and never count an event twice', () => {
  const f = fixture(); assert.deepEqual(result(f), result(structuredClone(f)));
});
test('archives and local buildings cannot inflate geographic coverage', () => {
  const f = fixture(); f.doors[0].active = false; assert.equal(result(f).doorCount, 0);
  f.doors[0].active = true; f.buildings[0].id = 'local_new'; f.doors[0].buildingId = 'local_new';
  const r = result(f); assert.equal(r.geographicPercent, 0); assert.equal(r.outsideCatalogueBuildingCount, 1); assert.equal(r.visitedDoorCount, 1);
});
test('missing, incomplete, duplicate or obsolete catalogues give unknown denominators', () => {
  for (const change of [f => { f.catalogues = []; }, f => { f.catalogues[0].complete = false; }, f => { f.catalogues[0].ids.push('rnb-0'); }, f => { f.zones[0].geometry.vertices[0].longitude = 3; }]) {
    const f = fixture(); change(f); assert.equal(result(f).detectedBuildingCount, null); assert.equal(result(f).geographicPercent, null);
  }
});
test('unproved statuses, references, revisions, dates and histories invalidate the projection', () => {
  for (const change of [f => { f.visits = []; }, f => { f.doors[0].currentStatusId = 'mystery'; }, f => { f.doors[0].revision = 4; }, f => { f.visits[0].voidedAt = '2026-10-01'; }, f => { f.visits[0].authorId = ''; }, f => { f.visits[0].syncedAt = null; }, f => { f.visits.push({ ...f.visits[0], id: 'other' }); }]) {
    const f = fixture(); change(f); assert.equal(result(f).completeness, 'invalid');
  }
});
test('correction uses revisions even when device dates run backwards', () => {
  const f = fixture(); f.visits.push({ ...f.visits[0], id: 'correction', statusId: 'retry', doorRevision: 2, replacesVisitId: 'v', occurredAt: '2026-09-01T00:00:00.000Z' });
  Object.assign(f.doors[0], { lastVisitId: 'correction', revision: 2, currentStatusId: 'retry', lastVisitAt: '2026-09-01T00:00:00.000Z' });
  assert.equal(result(f).countsByStatus.retry, 1); assert.equal(result(f).completeness, 'complete');
  f.visits[1].replacesVisitId = 'missing'; assert.equal(result(f).completeness, 'invalid');
});
test('a building move invalidates mismatched doors in both zones; coherent move transfers counts', () => {
  const f = fixture(); f.zones.push({ ...f.zones[0], id: 'new' }); f.buildings[0].zoneId = 'new';
  assert.deepEqual(computeWorkspaceStats(f).map(r => r.completeness), ['invalid', 'invalid']);
  f.doors[0].zoneId = 'new'; assert.deepEqual(computeWorkspaceStats(f).map(r => r.doorCount), [0, 1]);
});
test('missing cached door date with valid referenced visit is not a never-visited door', () => {
  const f = fixture(); delete f.doors[0].lastVisitAt; assert.equal(result(f).visitedDoorCount, 1); assert.equal(result(f).completeness, 'complete');
});
test('sensitive fields never enter a projection', () => {
  const f = fixture(); f.doors[0].foyer = 'SECRET'; f.visits[0].note = 'SECRET'; assert.equal(JSON.stringify(result(f)).includes('SECRET'), false);
});
