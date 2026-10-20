/**
 * Vérifie le bundle produit avant toute publication (lots A4 et A5).
 *
 *   node scripts/verify-build.mjs            build de production `dist/`
 *   node scripts/verify-build.mjs --deploy   idem, plus le projet Firebase attendu
 *   node scripts/verify-build.mjs --lab      build de recette `dist-lab/` (laboratoires attendus)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const lab = process.argv.includes('--lab');
const deploy = process.argv.includes('--deploy');
const root = resolve(lab ? 'dist-lab' : 'dist');
const failures = [];
const fail = (message) => failures.push(message);

const manifest = JSON.parse(readFileSync(join(root, '.vite/manifest.json'), 'utf8'));
const entry = Object.values(manifest).find((item) => item.isEntry && item.src === 'index.html');
if (!entry) fail('Aucune entrée index.html dans le manifeste Vite.');

// 1. La carte reste différée : MapLibre ne doit jamais entrer dans le bundle initial.
const mapPage = 'src/features/map/components/MapPage.tsx';
if (entry && !entry.dynamicImports?.includes(mapPage)) fail('L’entrée ne diffère plus la page carte (MapPage).');
const staticImports = (entry?.imports ?? []).map((key) => manifest[key]?.file ?? key);
if (staticImports.some((file) => /maplibre/i.test(file))) fail('MapLibre est chargé statiquement par l’entrée.');

// 2. Laboratoires : absents en production, présents en recette.
const LAB_MODULES = ['src/features/lab/TechnicalLab.tsx', 'src/design/DesignSystemPage.tsx', 'src/features/map/components/MapPreview.tsx', 'src/app/TechnicalRoutes.tsx'];
const LAB_MARKERS = [/Laboratoire technique/, /technical-map/, /technical-lab/, /Ouvrir le parcours carte/];
const assetsDir = join(root, 'assets');
const scripts = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
const bundleText = scripts.map((name) => readFileSync(join(assetsDir, name), 'utf8')).join('\n');
const emittedLabModules = LAB_MODULES.filter((module) => manifest[module]);
const labMarkers = LAB_MARKERS.filter((marker) => marker.test(bundleText)).map(String);
if (lab) {
  if (emittedLabModules.length < LAB_MODULES.length) fail('Le build de recette ne contient pas tous les laboratoires.');
} else {
  if (emittedLabModules.length > 0) fail(`Modules de laboratoire présents en production : ${emittedLabModules.join(', ')}.`);
  if (labMarkers.length > 0) fail(`Traces de laboratoire dans le bundle de production : ${labMarkers.join(', ')}.`);
}

// 3. Ressources essentielles de la PWA, cohérentes avec le service worker.
const serviceWorker = existsSync(join(root, 'sw.js')) ? readFileSync(join(root, 'sw.js'), 'utf8') : '';
if (!serviceWorker) fail('sw.js absent du build.');
const precached = [...serviceWorker.matchAll(/'(\/[^']+\.(?:js|css|webmanifest|svg|png|woff2|html))'/g)].map((match) => match[1]);
for (const path of precached) {
  if (!existsSync(join(root, path))) fail(`Le service worker précache ${path}, absent du build.`);
}
for (const asset of Object.values(manifest).flatMap(item => [item.file, ...item.css ?? [], ...item.assets ?? []])) {
  if (!serviceWorker.includes(JSON.stringify(`/${asset}`))) fail(`Le service worker ne prépare pas le composant différé ${asset}.`);
  if (!existsSync(join(root, asset))) fail(`Ressource de préparation absente : ${asset}.`);
}
if (serviceWorker.includes('__ATHAR_BUILD_VERSION__') || serviceWorker.includes('__ATHAR_LAZY_ASSETS__')) fail('Le manifeste hors ligne du build n’a pas été généré.');
try {
  const webManifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  for (const icon of webManifest.icons ?? []) {
    if (!existsSync(join(root, icon.src))) fail(`Icône du manifeste absente : ${icon.src}.`);
  }
  if (webManifest.display !== 'standalone') fail('Le manifeste PWA n’est plus en display standalone.');
} catch {
  fail('manifest.webmanifest absent ou illisible.');
}
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
if (!indexHtml.includes('manifest.webmanifest')) fail('index.html ne référence plus le manifeste PWA.');
if (!/name="athar-build" content="[0-9a-f]{20}"/.test(indexHtml)) fail('La version hors ligne est absente de index.html.');
if (!existsSync(join(root, 'fixtures/toulouse.pmtiles'))) fail('Fond de carte hors ligne fixtures/toulouse.pmtiles absent.');

// 4. Déploiement : le bundle vise le projet attendu, jamais la recette locale.
if (deploy) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!projectId || !bundleText.includes(projectId)) fail('Le bundle ne contient pas l’identifiant de projet Firebase attendu.');
  if (/athar-local|local-api-key/.test(bundleText)) fail('Le bundle contient la configuration de recette locale.');
}

if (failures.length > 0) {
  console.error(`Vérification du build ${lab ? 'de recette' : 'de production'} refusée :`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Build ${lab ? 'de recette' : 'de production'} vérifié : ${scripts.length} scripts, ${precached.length} ressources PWA, laboratoires ${lab ? 'présents' : 'absents'}.`);
