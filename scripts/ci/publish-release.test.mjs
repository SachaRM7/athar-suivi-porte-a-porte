import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('PR and push contexts cannot reach cloud publication even if publish is accidentally true', () => {
  for (const event of ['pull_request', 'push']) {
    const result = spawnSync(process.execPath, ['scripts/ci/publish-release.mjs'], { encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_REF: 'refs/heads/main', ATHAR_PUBLISH: 'true', ATHAR_FIREBASE_SERVICE_ACCOUNT: '' } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Publication réservée au lancement manuel explicite sur main/);
    assert.doesNotMatch(result.stderr, /Compte de publication/);
  }
});
