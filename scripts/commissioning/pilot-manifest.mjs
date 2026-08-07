import { readFile } from 'node:fs/promises';
import { assertNoSensitiveKeys } from './guard.mjs';

const STATUS_IDS = new Set(['unvisited', 'retry', 'contacted', 'do-not-return']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validatePilotManifest(manifest) {
  assertNoSensitiveKeys(manifest);
  assert(manifest?.kind === 'athar-pilot-manifest', 'Manifest kind must be athar-pilot-manifest.');
  assert(manifest.schemaVersion === 1, 'Manifest schemaVersion must be 1.');
  assert(manifest.projectId === 'athar-dev31', 'Manifest projectId must be athar-dev31.');
  assert(manifest.workspaceId === 'main', 'Manifest workspaceId must be main.');
  assert(Array.isArray(manifest.statuses) && manifest.statuses.length === 4, 'Manifest must include four statuses.');
  assert(new Set(manifest.statuses.map((status) => status.id)).size === 4, 'Status IDs must be unique.');
  for (const status of manifest.statuses) {
    assert(STATUS_IDS.has(status.id), `Unexpected status ID ${status.id}.`);
    assert(typeof status.label === 'string' && status.label.length > 0 && status.label.length <= 48, 'Status label is invalid.');
    assert(typeof status.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(status.color), 'Status color is invalid.');
    assert(Number.isInteger(status.order) && status.order >= 0, 'Status order is invalid.');
    assert(status.active === true, 'Pilot statuses must be active.');
  }
  const zone = manifest.zone;
  assert(zone && typeof zone.id === 'string' && zone.id.length > 0, 'Zone is required.');
  assert(typeof zone.name === 'string' && zone.name.length > 0 && zone.name.length <= 80, 'Zone name is invalid.');
  assert(typeof zone.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(zone.color), 'Zone color is invalid.');
  assert(['unassigned', 'prepared', 'active', 'complete'].includes(zone.coverageState), 'Zone coverageState is invalid.');
  assert(zone.assigneeLabel === null || (typeof zone.assigneeLabel === 'string' && zone.assigneeLabel.length <= 80), 'Zone assigneeLabel is invalid.');
  assert(zone.bbox && Number.isFinite(zone.bbox.north) && Number.isFinite(zone.bbox.south) && Number.isFinite(zone.bbox.east) && Number.isFinite(zone.bbox.west), 'Zone bbox is invalid.');
  assert(zone.bbox.south <= zone.bbox.north && zone.bbox.west <= zone.bbox.east, 'Zone bbox bounds are invalid.');
  assert(zone.geometry?.type === 'Polygon' && Array.isArray(zone.geometry.vertices) && zone.geometry.vertices.length >= 4 && zone.geometry.vertices.length <= 500, 'Zone geometry is invalid.');
  for (const vertex of zone.geometry.vertices) {
    assert(Number.isFinite(vertex.latitude) && Number.isFinite(vertex.longitude), 'Zone vertex is invalid.');
  }
  assert(Array.isArray(manifest.buildings) && manifest.buildings.length <= 25, 'Pilot supports at most 25 buildings.');
  const buildingIds = new Set();
  const doorIds = new Set();
  let doorCount = 0;
  for (const building of manifest.buildings) {
    assert(typeof building.id === 'string' && building.id.length > 0 && !buildingIds.has(building.id), 'Building IDs must be unique.');
    buildingIds.add(building.id);
    assert(typeof building.addressLabel === 'string' && building.addressLabel.length > 0 && building.addressLabel.length <= 160, 'Building addressLabel is invalid.');
    assert(Number.isFinite(building.latitude) && Number.isFinite(building.longitude), 'Building location is invalid.');
    assert(typeof building.geohash === 'string' && building.geohash.length >= 4 && building.geohash.length <= 12, 'Building geohash is invalid.');
    assert(Array.isArray(building.doors), 'Each building requires a door array.');
    doorCount += building.doors.length;
    for (const door of building.doors) {
      assert(typeof door.id === 'string' && door.id.length > 0 && !doorIds.has(door.id), 'Door IDs must be explicit, opaque and unique.');
      doorIds.add(door.id);
      assert(typeof door.label === 'string' && door.label.length > 0 && door.label.length <= 32, 'Door label is invalid.');
      assert(Number.isInteger(door.floor) && Number.isInteger(door.sortOrder), 'Door floor and sortOrder must be integers.');
    }
  }
  assert(doorCount <= 250, 'Pilot supports at most 250 doors.');
  assert(!('visits' in manifest), 'Pilot manifest cannot seed visits.');
  return { buildingCount: manifest.buildings.length, doorCount, statusIds: manifest.statuses.map((status) => status.id).sort() };
}

export async function readPilotManifest(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
