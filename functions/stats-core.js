/* Lot B: pure, deterministic projection. Never includes notes, profiles or markers. */
const { createHash } = require('node:crypto');
const STATUS_IDS = ['unvisited', 'contacted', 'retry', 'linked', 'do-not-return', 'locked'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const date = (value) => value?.toDate ? value.toDate().toISOString() : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const geometryHash = (zone) => hash(zone.geometry?.vertices ?? zone.geometry?.coordinates ?? null);
const validAuthor = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const percent = (part, total) => total ? Number(BigInt(part) * 100n / BigInt(total)) : null;

function catalogueDigest(ids) { return hash([...ids].sort()); }
function validateCatalogue(catalogue, zone) {
  if (!catalogue) return null;
  const ids = catalogue.ids;
  if (catalogue.schemaVersion !== 1 || catalogue.complete !== true || catalogue.geometryHash !== geometryHash(zone)
    || !Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id || id.startsWith('local_'))
    || new Set(ids).size !== ids.length || catalogue.detectedCount !== ids.length
    || catalogue.contentHash !== catalogueDigest(ids) || typeof catalogue.version !== 'string') return null;
  return new Set(ids);
}

function doorProblem(door, visits, visitsByDoor) {
  if (!STATUS_IDS.includes(door.currentStatusId)) return 'unknown-status';
  if (!Number.isSafeInteger(door.revision) || door.revision < 0) return 'invalid-revision';
  if (!door.lastVisitId) {
    return door.currentStatusId === 'unvisited' && door.revision === 0 && !door.lastVisitAt && !(visitsByDoor.get(door.id)?.length)
      ? null : 'missing-last-visit';
  }
  const visit = visits.get(door.lastVisitId);
  if (!visit || visit.doorId !== door.id || visit.doorRevision !== door.revision || visit.statusId !== door.currentStatusId
    || visit.voidedAt || !validAuthor(visit.authorId) || !date(visit.occurredAt) || !date(visit.syncedAt)
    || (door.lastVisitAt && date(door.lastVisitAt) !== date(visit.occurredAt))) return 'invalid-last-visit';
  const history = visitsByDoor.get(door.id) ?? [];
  const revisions = new Set();
  for (const item of history) {
    if (!STATUS_IDS.includes(item.statusId) || !validAuthor(item.authorId) || !date(item.occurredAt) || !date(item.syncedAt)) return 'invalid-history';
    if (!Number.isSafeInteger(item.doorRevision) || item.doorRevision < 1 || item.doorRevision > door.revision || revisions.has(item.doorRevision)) return 'ambiguous-history';
    revisions.add(item.doorRevision);
    if (item.replacesVisitId) {
      const replaced = visits.get(item.replacesVisitId);
      if (!replaced || replaced.doorId !== door.id || replaced.doorRevision >= item.doorRevision) return 'invalid-correction';
    }
  }
  if (revisions.size !== door.revision) return 'incomplete-history';
  return null;
}

function computeWorkspaceStats({ zones, buildings, doors, visits, catalogues = [] }) {
  const buildingMap = new Map(buildings.map(b => [b.id, b]));
  const visitMap = new Map(visits.map(v => [v.id, v]));
  const visitsByDoor = new Map();
  for (const visit of visits) {
    if (!visitsByDoor.has(visit.doorId)) visitsByDoor.set(visit.doorId, []);
    visitsByDoor.get(visit.doorId).push(visit);
  }
  return zones.map(zone => {
    const issues = {};
    const issue = code => { issues[code] = (issues[code] ?? 0) + 1; };
    const zoneIds = new Set(zones.map(z => z.id));
    const doorIds = new Set(doors.map(d => d.id));
    if (visits.some(v => !doorIds.has(v.doorId))) issue('orphan-visit');
    if (buildings.some(b => !zoneIds.has(b.zoneId)) || doors.some(d => !zoneIds.has(d.zoneId))) issue('orphan-zone');
    const countsByStatus = Object.fromEntries(STATUS_IDS.map(id => [id, 0]));
    const scopedBuildings = buildings.filter(b => b.zoneId === zone.id);
    const described = new Set(); const visited = new Set();
    let doorCount = 0; let visitedDoorCount = 0;
    for (const door of doors) {
      const building = buildingMap.get(door.buildingId);
      if (door.zoneId !== zone.id && building?.zoneId !== zone.id) continue;
      if (typeof door.active !== 'boolean') { issue('invalid-active'); continue; }
      if (!door.active) continue;
      doorCount++;
      if (!building || building.zoneId !== door.zoneId) { issue('invalid-building-zone'); continue; }
      const problem = doorProblem(door, visitMap, visitsByDoor);
      if (problem) { issue(problem); continue; }
      described.add(building.id);
      countsByStatus[door.currentStatusId]++;
      if (door.lastVisitId) { visited.add(building.id); visitedDoorCount++; }
    }
    const catalogue = catalogues.find(c => c.id === zone.id);
    const detected = validateCatalogue(catalogue, zone);
    const describedInCatalogue = detected ? [...described].filter(id => detected.has(id)).length : null;
    const visitedInCatalogue = detected ? [...visited].filter(id => detected.has(id)).length : null;
    return {
      zoneId: zone.id, schemaVersion: 2, formulaVersion: 'doors-history-v2',
      completeness: Object.keys(issues).length ? 'invalid' : 'complete', issues,
      geometryHash: geometryHash(zone), doorCount, countsByStatus, visitedDoorCount,
      buildingCount: scopedBuildings.length, describedBuildingCount: described.size, visitedBuildingCount: visited.size,
      excludedDoorCount: countsByStatus.linked + countsByStatus['do-not-return'],
      remainingDoorCount: doorCount - visitedDoorCount,
      catalogueVersion: detected ? catalogue.version : null,
      detectedBuildingCount: detected?.size ?? null,
      describedCatalogueBuildingCount: describedInCatalogue, visitedCatalogueBuildingCount: visitedInCatalogue,
      outsideCatalogueBuildingCount: detected ? scopedBuildings.filter(b => !detected.has(b.id)).length : null,
      geographicPercent: detected ? percent(visitedInCatalogue, detected.size) : null,
      descriptionPercent: detected ? percent(describedInCatalogue, detected.size) : null
    };
  });
}
module.exports = { STATUS_IDS, hash, date, geometryHash, catalogueDigest, validateCatalogue, doorProblem, computeWorkspaceStats };
