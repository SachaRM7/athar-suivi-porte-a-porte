/**
 * Lot A5.3 — cohérence entre le frontend et le backend qu'il attend.
 *
 * Bloquant :
 *   - le frontend appelle une Callable que la production n'exporte pas (hors liste
 *     explicite des callables réservées à l'émulateur, gardées par l'interface) ;
 *   - la production exporterait une Callable non prévue (inscription, amorçage).
 * Informatif (n'empêche pas Hosting, mais doit être lu) :
 *   - les règles ou les Functions du dépôt diffèrent de l'état déclaré publié
 *     (deploy/backend-state.json) : leur publication est une opération séparée, autorisée.
 *
 * Avec `--write <dossier>`, écrit `athar-release.json` dans le build : il dit quelle
 * version de règles et de Functions ce frontend a été construit à côté.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PRODUCTION_FUNCTIONS } from './deploy-config.mjs';

/** Callables utilisées seulement en recette, derrière `environment.firebase.useEmulators`. */
const EMULATOR_ONLY_CALLABLES = ['claimInitialAdmin'];

const sha256 = (...files) => {
  const hash = createHash('sha256');
  for (const file of files) hash.update(readFileSync(file));
  return hash.digest('hex');
};

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const called = [...new Set(sourceFiles('src').flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/httpsCallable(?:<[^>]*>)?\(\s*\w+\s*,\s*'([^']+)'/g)].map((match) => match[1])))].sort();

const childEnv = { ...process.env, GCLOUD_PROJECT: 'athar-contract', FIREBASE_CONFIG: JSON.stringify({ projectId: 'athar-contract' }) };
delete childEnv.FUNCTIONS_EMULATOR;
delete childEnv.ATHAR_FUNCTIONS_MODE;
const exported = JSON.parse(String(execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify(Object.keys(require("./index.js")).sort()))'], { cwd: resolve('functions'), env: childEnv })).trim().split('\n').at(-1));

const errors = [];
for (const name of called) {
  if (!exported.includes(name) && !EMULATOR_ONLY_CALLABLES.includes(name)) errors.push(`Le frontend appelle « ${name} », absente des Functions de production.`);
}
for (const name of exported) {
  if (!PRODUCTION_FUNCTIONS.includes(name)) errors.push(`La production exporterait « ${name} », non prévue.`);
}

const release = {
  commit: process.env.GITHUB_SHA ?? (() => { try { return String(execFileSync('git', ['rev-parse', 'HEAD'])).trim(); } catch { return null; } })(),
  rulesSha256: sha256('firestore.rules'),
  functionsSha256: sha256('functions/index.js', 'functions/runtime-mode.js'),
  productionFunctions: exported,
  callablesUsedByFrontend: called
};
const state = JSON.parse(readFileSync('deploy/backend-state.json', 'utf8'));
const notices = [];
if (state.rulesSha256 !== release.rulesSha256) notices.push(`Règles Firestore du dépôt (${release.rulesSha256.slice(0, 12)}) ≠ état déclaré publié (${state.rulesSha256?.slice(0, 12) ?? 'inconnu'}). Publication des règles à faire séparément, après autorisation.`);
if (state.functionsSha256 !== release.functionsSha256) notices.push(`Functions du dépôt (${release.functionsSha256.slice(0, 12)}) ≠ état déclaré publié (${state.functionsSha256?.slice(0, 12) ?? 'inconnu'}). Vérifier les Functions réellement en ligne (procédure A3.4).`);

const writeIndex = process.argv.indexOf('--write');
if (writeIndex > 0) {
  const target = join(process.argv[writeIndex + 1], 'athar-release.json');
  if (!existsSync(process.argv[writeIndex + 1])) errors.push(`Dossier de build absent : ${process.argv[writeIndex + 1]}`);
  else writeFileSync(target, `${JSON.stringify(release, null, 2)}\n`);
}

for (const notice of notices) console.warn(`AVERTISSEMENT : ${notice}`);
if (process.env.GITHUB_STEP_SUMMARY && notices.length > 0) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Cohérence backend\n\n${notices.map((notice) => `- ${notice}`).join('\n')}\n`);
}
if (errors.length > 0) {
  console.error('Contrat frontend/backend rompu :');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Contrat frontend/backend respecté : ${called.join(', ')} → ${exported.join(', ')}.`);
