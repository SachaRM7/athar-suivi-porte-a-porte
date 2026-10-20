/**
 * Bloque un build de déploiement mal configuré AVANT qu'il n'atteigne Firebase Hosting.
 * Usage : `npm run build:deploy` (enchaîne ce contrôle, le build et verify-build --deploy).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { deployConfigErrors } from './ci/deploy-config.mjs';

// Même fusion que `vite build` en mode production : fichiers .env*, puis l'environnement.
const env = loadEnv('production', process.cwd(), 'VITE_');
const firebaserc = existsSync('.firebaserc') ? JSON.parse(readFileSync('.firebaserc', 'utf8')) : {};
const expectedProjectId = process.env.ATHAR_EXPECTED_PROJECT_ID?.trim() || firebaserc.projects?.default;

function productionFunctionExports() {
  if (!existsSync(resolve('functions/node_modules/firebase-functions'))) {
    throw new Error('functions/node_modules absent : lancer `npm ci --prefix functions` avant le contrôle.');
  }
  const childEnv = { ...process.env, GCLOUD_PROJECT: expectedProjectId ?? 'athar-check', FIREBASE_CONFIG: JSON.stringify({ projectId: expectedProjectId ?? 'athar-check' }) };
  delete childEnv.FUNCTIONS_EMULATOR;
  delete childEnv.ATHAR_FUNCTIONS_MODE;
  const output = execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify(Object.keys(require("./index.js")).sort()))'], { cwd: resolve('functions'), env: childEnv });
  return JSON.parse(String(output).trim().split('\n').at(-1));
}

const errors = deployConfigErrors(env, { expectedProjectId, productionFunctions: productionFunctionExports() });
if (errors.length > 0) {
  console.error('Configuration de déploiement refusée :');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Configuration de déploiement valide pour le projet ${expectedProjectId}.`);
