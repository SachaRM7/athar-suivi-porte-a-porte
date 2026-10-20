/** Catalogue before tiling: one stable anchor per RNB, independent of tile visibility. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import core from '../../functions/stats-core.js';
const { hash, geometryHash, catalogueDigest } = core;

function positions(value) {
  return typeof value?.[0] === 'number' ? [value] : value.flatMap(positions);
}
export function makeCatalogue(features, { complete = false, extent, sourceVersion } = {}) {
  if (!sourceVersion || !Array.isArray(extent) || extent.length !== 4 || extent.some(n => !Number.isFinite(n)) || extent[0] >= extent[2] || extent[1] >= extent[3]) throw new Error('Source version and [west,south,east,north] extent required.');
  const points = new Map();
  for (const feature of features) {
    const id = feature.properties?.rnb_id;
    if (typeof id !== 'string' || !id || id.startsWith('local_')) throw new Error('Missing RNB identity.');
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) throw new Error('Invalid building geometry.');
    // Stable extreme vertex, inside/on the footprint, even for disjoint multi-footprints.
    for (const [longitude, latitude] of positions(feature.geometry.coordinates)) {
      if (![longitude, latitude].every(Number.isFinite)) throw new Error('Invalid coordinate.');
      const previous = points.get(id);
      if (!previous || longitude < previous[0] || (longitude === previous[0] && latitude < previous[1])) points.set(id, [longitude, latitude]);
    }
  }
  const entries = [...points].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, point]) => ({ id, point }));
  const payload = { schemaVersion: 1, sourceVersion, complete, extent, entries };
  return { ...payload, version: hash(payload) };
}
export function contains(point, vertices) {
  const [x, y] = point; let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [ax, ay] = vertices[j], [bx, by] = vertices[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
export function zoneCatalogue(catalogue, zone) {
  const { version, ...payload } = catalogue;
  if (version !== hash(payload) || !Array.isArray(catalogue.entries)
    || new Set(catalogue.entries.map(entry => entry.id)).size !== catalogue.entries.length) throw new Error('Invalid catalogue fingerprint or duplicate IDs.');
  const vertices = zone.geometry.vertices?.map(p => [p.longitude, p.latitude]) ?? zone.geometry.coordinates;
  if (!Array.isArray(vertices) || vertices.length < 4) throw new Error('Invalid zone geometry.');
  const [west, south, east, north] = catalogue.extent;
  const complete = catalogue.complete === true && vertices.every(([x, y]) => x >= west && x <= east && y >= south && y <= north);
  // Overlaps deliberately count in each zone, never sum zone denominators into a city total.
  const ids = catalogue.entries.filter(entry => contains(entry.point, vertices)).map(entry => entry.id).sort();
  const contentHash = catalogueDigest(ids);
  const geometry = geometryHash(zone);
  return { id: zone.id, schemaVersion: 1, version: hash([catalogue.version, geometry, contentHash, complete]), sourceVersion: catalogue.version,
    geometryHash: geometry, complete, detectedCount: ids.length, contentHash, ids };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const arg = key => args[args.indexOf(key) + 1];
  if (!args.includes('--input') || !args.includes('--output') || !args.includes('--extent')) throw new Error('Required: --input geojsonl --output json --extent west,south,east,north [--complete].');
  const source = readFileSync(arg('--input'), 'utf8');
  const catalogue = makeCatalogue(source.trim().split('\n').filter(Boolean).map(line => JSON.parse(line.replace(/^\x1e/, ''))), {
    complete: args.includes('--complete'), extent: arg('--extent').split(',').map(Number),
    sourceVersion: createHash('sha256').update(source).digest('hex')
  });
  writeFileSync(arg('--output'), `${JSON.stringify(catalogue)}\n`);
  console.log(JSON.stringify({ version: catalogue.version, detectedCount: catalogue.entries.length, complete: catalogue.complete }));
}
