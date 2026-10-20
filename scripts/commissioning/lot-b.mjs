/** Explicit operator commands; dry run by default. Never reads or modifies root history. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
import { zoneCatalogue } from '../carto/catalogue.mjs';
import rebuild from '../../functions/stats-rebuild.js';
const args = process.argv.slice(2); const arg = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const projectId = arg('--project'); const workspaceId = arg('--workspace');
if (!projectId || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(workspaceId ?? '')) throw new Error('--project and --workspace required.');
const apply = args.includes('--apply');
if (apply && arg('--confirm-project') !== projectId) throw new Error('--apply requires --confirm-project matching --project.');
const db = getFirestore(initializeApp({ projectId }));
if (args.includes('--catalogue')) {
  const catalogue = JSON.parse(readFileSync(arg('--catalogue'), 'utf8'));
  const zones = await db.collection(`workspaces/${workspaceId}/zones`).get();
  const reports = [];
  for (const zone of zones.docs) {
    const pack = zoneCatalogue(catalogue, { ...zone.data(), id: zone.id });
    reports.push({ zoneId: zone.id, detectedCount: pack.detectedCount, complete: pack.complete, version: pack.version });
    if (!apply) continue;
    const ref = db.doc(`workspaces/${workspaceId}/zoneCatalogues/${zone.id}`);
    // All immutable chunks are durable before the only pointer that activates a generation.
    for (let i = 0; i < pack.ids.length; i += 1000) {
      await ref.collection('versions').doc(pack.version).collection('chunks').doc(String(i / 1000).padStart(6, '0')).set({ ids: pack.ids.slice(i, i + 1000) });
    }
    const { ids: _ids, id: _id, ...manifest } = pack;
    await ref.set(manifest);
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', catalogues: reports }));
} else {
  const result = await rebuild.rebuildWorkspaceStats(db, workspaceId, { dryRun: !apply });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }, null, 2));
}
