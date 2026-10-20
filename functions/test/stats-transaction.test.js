const { test } = require('node:test');
const assert = require('node:assert/strict');
const { statsTransaction } = require('../stats-transaction');
const closed = () => Object.assign(new Error('3 INVALID_ARGUMENT: Transaction is invalid or closed.'), { code: 3 });
test('restarts the entire closed transaction with the same read-time options', async () => {
  let calls = 0; const work = () => 'complete'; const options = { readOnly: true, readTime: 'pinned' };
  const db = { runTransaction: async (callback, opts) => {
    assert.equal(callback, work); assert.equal(opts, options);
    if (++calls < 3) throw closed();
    return callback();
  } };
  assert.equal(await statsTransaction(db, work, options), 'complete'); assert.equal(calls, 3);
});
test('never retries unrelated invalid arguments', async () => {
  let calls = 0; const error = Object.assign(new Error('Invalid document'), { code: 3 });
  await assert.rejects(statsTransaction({ runTransaction: async () => { calls++; throw error; } }, () => {}), /Invalid document/);
  assert.equal(calls, 1);
});
test('stops after three failed attempts and leaves failure handling to the caller', async () => {
  let calls = 0;
  await assert.rejects(statsTransaction({ runTransaction: async () => { calls++; throw closed(); } }, () => {}), /invalid or closed/);
  assert.equal(calls, 3);
});
