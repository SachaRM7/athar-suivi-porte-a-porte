import { assertExplicitCloudApply, writeCommissioningJson } from './guard.mjs';
import { cliBearer, jsonFetch } from './cloud-read.mjs';

const projectId = assertExplicitCloudApply(process.argv.slice(2));
const defaults = [
  ['unvisited', 'Pas encore fait', '#8B948F', 0],
  ['contacted', 'Contact \u00e9tabli', '#1F7A5A', 1],
  ['retry', 'Absent', '#C87A0A', 2],
  ['linked', "Attach\u00e9 \u00e0 l'effort", '#2456A6', 3],
  ['do-not-return', 'Ne pas d\u00e9ranger', '#A93B2E', 4],
  ['locked', 'Acc\u00e8s bloqu\u00e9', '#6B5AA8', 5]
];
const bearer = await cliBearer();
const headers = { Authorization: `Bearer ${bearer}`, 'x-goog-user-project': projectId };
const root = `projects/${projectId}/databases/(default)/documents`;
const collection = await jsonFetch(`https://firestore.googleapis.com/v1/${root}/workspaces/main/statuses?pageSize=20`, { headers });
if (!collection.ok) throw new Error(`Unable to inspect production statuses (${collection.status}).`);
const existing = new Map((collection.body?.documents ?? []).map((document) => [document.name.split('/').at(-1), document.fields]));
const existingIds = new Set(existing.keys());
const missing = defaults.filter(([id]) => !existingIds.has(id));
const drifted = defaults.filter(([id, label, color, order]) => {
  const fields = existing.get(id);
  return fields && (
    fields.label?.stringValue !== label || fields.color?.stringValue !== color ||
    Number(fields.order?.integerValue) !== order || fields.active?.booleanValue !== true
  );
});

const writes = [...missing, ...drifted].map(([id, label, color, order]) => ({
  update: {
    name: `${root}/workspaces/main/statuses/${id}`,
    fields: {
      label: { stringValue: label },
      color: { stringValue: color },
      order: { integerValue: String(order) },
      active: { booleanValue: true }
    }
  },
  currentDocument: { exists: existingIds.has(id) }
}));

if (writes.length > 0) {
  const response = await jsonFetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ writes })
  });
  if (!response.ok) throw new Error(`Unable to create production statuses (${response.status}).`);
}

const report = {
  kind: 'athar-default-statuses-seed',
  generatedAt: new Date().toISOString(),
  projectId,
  createdIds: missing.map(([id]) => id),
  updatedIds: drifted.map(([id]) => id),
  unchangedIds: defaults.map(([id]) => id).filter((id) => !missing.some(([candidate]) => candidate === id) && !drifted.some(([candidate]) => candidate === id))
};
const output = await writeCommissioningJson(`statuses-${Date.now()}.json`, report);
console.log(JSON.stringify({ output, createdIds: report.createdIds, updatedIds: report.updatedIds, total: existingIds.size + missing.length }, null, 2));
