import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendCallables } from './frontend-callables.mjs';
test('checks all production callables with nested generic types and client expressions', () => {
  assert.deepEqual(frontendCallables(`
    httpsCallable<unknown, { outings: Record<string, Outing[]> }>(getFirebaseClient().functions, 'listOutings')({});
    httpsCallable(client.functions, 'manageMember');
    // httpsCallable(functions, 'not-a-call');
  `), ['listOutings', 'manageMember']);
});
test('refuses dynamic callable names that cannot be checked before publication', () => {
  assert.throws(() => frontendCallables('httpsCallable(functions, name)'), /nom statique/);
});
