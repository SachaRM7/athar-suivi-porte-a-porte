/** Read-only cloud/emulator inventory. Only a redacted report is written. */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { auditData } from './data-audit.mjs';
const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { readWorkspaceSnapshot } = require('./stats-rebuild.js');
const args = process.argv.slice(2); const arg = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const projectId = arg('--project'), workspaceId = arg('--workspace'), output = arg('--output');
if (!projectId || !workspaceId || !output || args.includes('--apply')) throw new Error('Read-only: --project --workspace --output required; --apply forbidden.');
const db = getFirestore(initializeApp({ projectId }));
const snapshot = await readWorkspaceSnapshot(db, workspaceId);
const documents = ['zones', 'buildings', 'doors', 'visits'].flatMap(collection => snapshot[collection].map(({ id, ...data }) => ({ path: `workspaces/${workspaceId}/${collection}/${id}`, data })));
// listDocuments also exposes missing ancestor documents: nested history cannot hide behind a deleted parent.
const buildingRefs = await db.collection('buildings').listDocuments();
for (const buildingRef of buildingRefs) {
  const building = await buildingRef.get();
  if (building.exists) documents.push({ path: building.ref.path, data: building.data() });
  for (const doorRef of await buildingRef.collection('doors').listDocuments()) {
    const door = await doorRef.get();
    if (door.exists) documents.push({ path: door.ref.path, data: door.data() });
    for (const visitRef of await doorRef.collection('passages').listDocuments()) {
      const visit = await visitRef.get();
      if (visit.exists) documents.push({ path: visit.ref.path, data: visit.data() });
      if (documents.length > 50000) throw new Error('Inventory budget exceeded; no partial report is published.');
    }
  }
}
const report = auditData(documents, workspaceId);
// Historical scans are diagnostic; freeze old writers and take a backup before any retirement.
writeFileSync(output, `${JSON.stringify({ ...report, projectId, sourceReadTime: snapshot.sourceReadTime.toDate().toISOString(), retirementAllowed: false,
  retirementGate: 'Verified backup and historical write freeze required; this command never authorizes deletion.' }, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ projectId, workspaceId, mode: 'read-only', output, counts: report.counts }));
