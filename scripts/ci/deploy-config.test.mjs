import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployConfigErrors } from './deploy-config.mjs';

const valid = {
  VITE_FIREBASE_API_KEY: 'AIzaSy-public-web-key', VITE_FIREBASE_AUTH_DOMAIN: 'athar-dev31.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'athar-dev31', VITE_FIREBASE_APP_ID: '1:123:web:abc'
};
const options = { expectedProjectId: 'athar-dev31', productionFunctions: ['createMember'] };

test('accepts a complete production configuration', () => {
  assert.deepEqual(deployConfigErrors(valid, options), []);
});

test('refuses a missing Firebase web configuration', () => {
  assert.match(deployConfigErrors({ ...valid, VITE_FIREBASE_APP_ID: '' }, options).join(), /VITE_FIREBASE_APP_ID/);
});

test('refuses another project than the expected one', () => {
  assert.match(deployConfigErrors({ ...valid, VITE_FIREBASE_PROJECT_ID: 'athar-local' }, options).join(), /athar-local/);
});

test('refuses emulator options and technical routes', () => {
  assert.equal(deployConfigErrors({ ...valid, VITE_USE_FIREBASE_EMULATORS: 'true' }, options).length, 1);
  assert.equal(deployConfigErrors({ ...valid, VITE_ATHAR_TECHNICAL_ROUTES: 'true' }, options).length, 1);
  assert.equal(deployConfigErrors({ ...valid, VITE_FIREBASE_API_KEY: 'local-api-key' }, options).length, 1);
});

test('refuses a functions bundle that would publish self-service registration', () => {
  assert.match(deployConfigErrors(valid, { ...options, productionFunctions: ['createMember', 'registerMember'] }).join(), /registerMember/);
});

test('never echoes the API key value', () => {
  const errors = deployConfigErrors({ ...valid, VITE_FIREBASE_API_KEY: 'local-secretish' }, options).join();
  assert.doesNotMatch(errors, /local-secretish/);
});
