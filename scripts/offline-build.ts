import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Includes every emitted lazy chunk. A changed build gets a distinct, coherent shell. */
export function offlineBuild(): Plugin {
  let outputDirectory = '';
  return {
    name: 'athar-offline-shell',
    apply: 'build',
    configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const manifest = JSON.parse(readFileSync(resolve(outputDirectory, '.vite/manifest.json'), 'utf8')) as Record<string, { file: string; css?: string[]; assets?: string[] }>;
      const files = [...new Set(Object.values(manifest).flatMap(entry => [entry.file, ...entry.css ?? [], ...entry.assets ?? []]))].sort();
      const hash = createHash('sha256');
      hash.update(readFileSync(resolve(outputDirectory, 'sw.js')));
      for (const file of ['index.html', ...files]) hash.update(file).update(readFileSync(resolve(outputDirectory, file)));
      const version = hash.digest('hex').slice(0, 20);
      const indexPath = resolve(outputDirectory, 'index.html');
      writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('</head>', `<meta name="athar-build" content="${version}"></head>`));
      const workerPath = resolve(outputDirectory, 'sw.js');
      const worker = readFileSync(workerPath, 'utf8')
        .replace("'__ATHAR_BUILD_VERSION__'", JSON.stringify(version))
        .replace('/* __ATHAR_LAZY_ASSETS__ */', files.map(file => JSON.stringify(`/${file}`)).join(','));
      writeFileSync(workerPath, worker);
    }
  };
}
