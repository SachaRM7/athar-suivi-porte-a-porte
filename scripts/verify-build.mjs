import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('dist/.vite/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entry = Object.values(manifest).find((item) => item.isEntry && item.src === 'index.html');
const mapModule = 'src/features/map/components/OfflineMap.tsx';

if (!entry || !entry.dynamicImports?.includes(mapModule)) {
  throw new Error('The application entry no longer defers the MapLibre feature.');
}
if (!manifest[mapModule]?.file) {
  throw new Error('The deferred MapLibre feature is missing from the build manifest.');
}

console.log(`Deferred map chunk: ${manifest[mapModule].file}`);
