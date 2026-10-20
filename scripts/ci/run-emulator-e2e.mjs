/**
 * Équivalent multiplateforme de `scripts/run-playwright-emulator.ps1`.
 *
 * À lancer DANS `firebase emulators:exec` (cf. `npm run test:e2e:emulator:ci`) : construit
 * l'application contre les émulateurs locaux, injecte la fixture `pilote-minimal`, puis
 * joue les parcours `@emulator`. Aucun projet cloud n'est contacté.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const env = {
  ...process.env,
  VITE_FIREBASE_API_KEY: 'local-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
  VITE_FIREBASE_PROJECT_ID: 'athar-local',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:athar-local',
  VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_WORKSPACE_ID: 'main',
  ATHAR_PREVIEW_DIR: 'dist',
  ATHAR_E2E_BOOTSTRAP_CODE: randomBytes(32).toString('hex')
};

function run(command) {
  console.log(`\n> ${command}`);
  const result = spawnSync(command, { env, shell: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('node scripts/seed-playwright-emulator.mjs');
run('npx vite build');
run('npx playwright test tests/production-routes-emulator.spec.ts tests/onboarding-emulator.spec.ts');
// Le conflit entre deux appareils, avec cache persistant et reprise hors ligne, fait
// partie de la barrière de validation ; il ne peut plus être écarté par une variable.
run('npx playwright test tests/field-sync-emulator.spec.ts --grep-invert "desktop dashboard"');
// Les projections volontairement invalides de la recette admin ne doivent pas rendre la
// fixture terrain illisible : elles ne sont injectées que pour ce dernier parcours.
run('node scripts/seed-playwright-emulator.mjs --with-regressions');
run('npx playwright test tests/field-sync-emulator.spec.ts --grep "desktop dashboard"');
// La recette admin supprime volontairement un statut ; repartir d'une configuration valide.
run('node scripts/seed-playwright-emulator.mjs');
run('npx playwright test tests/terrain-preparation-emulator.spec.ts');

// Grandes zones et gestes tactiles sur les deux moteurs mobiles.
run('npx playwright test --config playwright.mobile.config.ts --grep @emulator');
