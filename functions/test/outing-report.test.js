const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const { summarizeOuting } = require('../outing-report');
const t = value => Timestamp.fromMillis(value);
const outing = { endedAt: t(500), participants: { a: { joinedAt: t(100) }, b: { joinedAt: t(200), leftAt: t(400) } } };
const visit = (authorId, doorId, at, sync = 300) => ({ authorId, doorId, statusId: 'retry', occurredAt: t(at), syncedAt: t(sync) });
test('counts every intervention once and distinct doors once, with no profile or note in the report', () => {
  const result = summarizeOuting(outing, [visit('a', 'one', 110), visit('a', 'one', 120), { ...visit('b', 'two', 300), note: 'private', foyer: 'femme' }]);
  assert.equal(result.visitCount, 3); assert.equal(result.doorCount, 2);
  assert.deepEqual(result.byParticipant, { a: 2, b: 1 });
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('includes late sync inside the period and isolates unknown participants, clock errors and post-closure visits', () => {
  const result = summarizeOuting(outing, [visit('a', 'one', 110, 1000), visit('a', 'two', 501), visit('b', 'three', 450), visit('b', 'four', 199), visit('other', 'five', 300), { ...visit('a', 'six', 300), voidedAt: t(350) }]);
  assert.equal(result.visitCount, 1); assert.equal(result.outsidePeriodCount, 4); assert.equal(result.lateSyncCount, 1);
});
test('accepts boundary dates and an empty ongoing outing without invented coverage', () => {
  assert.equal(summarizeOuting(outing, [visit('a','one',100), visit('a','two',500)]).visitCount, 2);
  assert.equal(summarizeOuting({ ...outing, endedAt: null }, []).doorCount, 0);
});
