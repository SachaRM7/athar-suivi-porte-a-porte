/**
 * Recopie les polices d'interface depuis node_modules/@fontsource vers public/fonts/ui/.
 *
 * Les polices sont auto-hébergées : aucun appel à Google Fonts ou à un autre fournisseur
 * tiers n'est autorisé au runtime (01-DESIGN-SYSTEM.md). Elles font partie du shell
 * hors ligne, parce que la lecture mono d'une adresse n'est pas un embellissement.
 *
 * Seules les graisses prescrites sont copiées. Sous-ensemble `latin` pour les trois
 * familles latines — il couvre l'ensemble des caractères français, œ et Œ compris —
 * et `arabic` pour le أثر du wordmark.
 *
 * Relancer après une mise à jour des paquets : node scripts/sync-webfonts.mjs
 */
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'fonts', 'ui');

/** [paquet, fichier source, nom de destination] */
const FACES = [
  ['space-grotesk', 'space-grotesk-latin-600-normal.woff2', 'space-grotesk-600.woff2'],
  ['ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2', 'ibm-plex-sans-400.woff2'],
  ['ibm-plex-sans', 'ibm-plex-sans-latin-500-normal.woff2', 'ibm-plex-sans-500.woff2'],
  ['ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2', 'ibm-plex-sans-600.woff2'],
  ['ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2', 'ibm-plex-mono-500.woff2'],
  ['ibm-plex-mono', 'ibm-plex-mono-latin-600-normal.woff2', 'ibm-plex-mono-600.woff2'],
  ['noto-kufi-arabic', 'noto-kufi-arabic-arabic-600-normal.woff2', 'noto-kufi-arabic-600.woff2'],
];

/** Les quatre familles sont sous SIL Open Font License 1.1 : la licence accompagne les fichiers. */
const LICENCES = [
  ['space-grotesk', 'LICENSE', 'LICENSE-space-grotesk.txt'],
  ['ibm-plex-sans', 'LICENSE', 'LICENSE-ibm-plex.txt'],
  ['noto-kufi-arabic', 'LICENSE', 'LICENSE-noto-kufi-arabic.txt'],
];

async function main() {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  let total = 0;
  for (const [pkg, source, destination] of FACES) {
    const from = join(root, 'node_modules', '@fontsource', pkg, 'files', source);
    const to = join(target, destination);
    await copyFile(from, to);
    total += (await stat(to)).size;
    console.log(`${destination.padEnd(30)} ${Math.round((await stat(to)).size / 1024)} Ko`);
  }

  for (const [pkg, source, destination] of LICENCES) {
    const from = join(root, 'node_modules', '@fontsource', pkg, source);
    try {
      await copyFile(from, join(target, destination));
    } catch {
      console.warn(`Licence introuvable pour ${pkg} — à récupérer à la main.`);
    }
  }

  const written = await readdir(target);
  console.log(`\n${FACES.length} polices, ${Math.round(total / 1024)} Ko au total, ${written.length} fichiers dans public/fonts/ui/.`);
}

await main();
