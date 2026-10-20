/** Read-only canonical and historical diagnostics on a local logical export. */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import core from '../../functions/stats-core.js';
const LEGACY_STATUS = { todo: 'unvisited', open: 'contacted', away: 'retry', linked: 'linked', dnd: 'do-not-return', locked: 'locked' };
export function auditData(documents, workspaceId) {
  const prefix = `workspaces/${workspaceId}/`;
  const read = name => documents.filter(d => d.path.startsWith(`${prefix}${name}/`) && d.path.split('/').length === 4).map(d => ({ ...d.data, id: d.path.split('/').at(-1) }));
  const zones = read('zones'), buildings = read('buildings'), doors = read('doors'), visits = read('visits');
  const issues = [];
  const report = (code, path) => issues.push({ code, reference: core.hash(path) });
  const seen = new Set();
  for (const doc of documents) { if (seen.has(doc.path)) report('duplicate-path', doc.path); seen.add(doc.path); }
  for (const building of buildings) if (!zones.some(z => z.id === building.zoneId)) report('orphan-building-zone', `${prefix}buildings/${building.id}`);
  for (const door of doors) if (!buildings.some(b => b.id === door.buildingId)) report('orphan-door', `${prefix}doors/${door.id}`);
  for (const visit of visits) if (!doors.some(d => d.id === visit.doorId)) report('orphan-visit', `${prefix}visits/${visit.id}`);
  const visitMap = new Map(visits.map(v => [v.id, v]));
  const visitsByDoor = new Map(doors.map(d => [d.id, visits.filter(v => v.doorId === d.id)]));
  for (const door of doors) {
    const problem = core.doorProblem(door, visitMap, visitsByDoor);
    if (problem) report(problem, `${prefix}doors/${door.id}`);
    if (door.lastVisitId && !core.date(door.lastVisitAt)) report('missing-door-date', `${prefix}doors/${door.id}`);
  }
  const legacy = documents.filter(d => /^buildings\/[^/]+(?:\/doors\/[^/]+(?:\/passages\/[^/]+)?)?$/.test(d.path));
  const migrationPlan = legacy.map(doc => {
    const parts = doc.path.split('/');
    const passage = parts.length === 6;
    const building = parts.length === 2;
    const reasons = [];
    // No order or revision can be inferred safely from a timestamp alone.
    if (passage) {
      if (!LEGACY_STATUS[doc.data.statut]) reasons.push('unknown-status');
      if (!core.date(doc.data.at)) reasons.push('missing-date');
      if (!doc.data.auteurUid && !doc.data.by && !doc.data.authorId && !doc.data.createdBy) reasons.push('missing-author');
      reasons.push('revision-order-requires-review');
    } else reasons.push('structure-and-zone-require-review');
    const rnbId = building && /^[A-Z0-9]{12}$/.test(doc.data.rnbId ?? '') ? doc.data.rnbId : null;
    if (building && !rnbId) reasons.push('rnb-identity-requires-review');
    return { sourceReference: core.hash(doc.path), targetCollection: passage ? 'visits' : building ? 'buildings' : 'doors',
      targetId: building ? rnbId : `legacy_${core.hash(doc.path)}`, buildingReference: core.hash(`buildings/${parts[1]}`),
      state: 'quarantined', reasons };
  }).sort((a, b) => a.sourceReference.localeCompare(b.sourceReference));
  const projections = core.computeWorkspaceStats({ zones, buildings, doors, visits });
  return { schemaVersion: 1, mode: 'read-only', workspaceId, counts: { zones: zones.length, buildings: buildings.length, doors: doors.length, visits: visits.length, historicalDocuments: legacy.length },
    issues: issues.sort((a, b) => a.reference.localeCompare(b.reference) || a.code.localeCompare(b.code)),
    projections: projections.map(p => ({ zoneReference: core.hash(p.zoneId), completeness: p.completeness, issues: p.issues })), migrationPlan,
    retirementAllowed: legacy.length === 0 && issues.length === 0 && projections.every(p => p.completeness === 'complete') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const arg = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  if (!arg('--input') || !arg('--output') || !arg('--workspace')) throw new Error('--input logical-export.json --output report.json --workspace required.');
  const documents = JSON.parse(readFileSync(arg('--input'), 'utf8'));
  writeFileSync(arg('--output'), `${JSON.stringify(auditData(documents, arg('--workspace')), null, 2)}\n`, { mode: 0o600 });
}
