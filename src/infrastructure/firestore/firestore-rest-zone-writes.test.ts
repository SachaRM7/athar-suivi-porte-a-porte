import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Zone } from '../../domain/workspace/models';
import { deleteEmptyZoneWithRest, saveZoneWithRest, ZoneContainsBuildingsError } from './firestore-rest-zone-writes';

const auth = { projectId: 'athar-test', getIdToken: async () => 'admin-token' };
const zone: Zone = {
  id: 'zone-a',
  name: 'Zone A',
  color: '#2456A6',
  coverageState: 'active',
  assigneeLabel: null,
  bbox: { north: 43.61, south: 43.60, east: 1.45, west: 1.44 },
  geometry: {
    type: 'Polygon',
    coordinates: [[1.44, 43.60], [1.45, 43.60], [1.45, 43.61], [1.44, 43.60]]
  }
};

afterEach(() => vi.unstubAllGlobals());

describe('Firestore REST zone writes', () => {
  it('persists the name, color and geometry with the administrator token', async () => {
    let commitBody: unknown;
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      commitBody = JSON.parse(String(init?.body));
      return Response.json({ writeResults: [] });
    }));

    await saveZoneWithRest(auth, 'main', zone);

    expect(commitBody).toMatchObject({ writes: [{ update: { fields: {
      name: { stringValue: 'Zone A' },
      color: { stringValue: '#2456A6' }
    } } }] });
    const body = commitBody as { writes: Array<{ update: { fields: { geometry: { mapValue: { fields: { vertices: { arrayValue: { values: unknown[] } } } } } } } }> };
    expect(body.writes[0]?.update.fields.geometry.mapValue.fields.vertices.arrayValue.values).toEqual([
      { geoPointValue: { latitude: 43.60, longitude: 1.44 } },
      { geoPointValue: { latitude: 43.60, longitude: 1.45 } },
      { geoPointValue: { latitude: 43.61, longitude: 1.45 } },
      { geoPointValue: { latitude: 43.60, longitude: 1.44 } }
    ]);
  });

  it('deletes an empty zone inside the same transaction used to check its buildings', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, body });
      if (url.endsWith(':beginTransaction')) return Response.json({ transaction: 'transaction-a' });
      if (url.endsWith('/workspaces/main:runQuery')) return Response.json([{}]);
      if (url.endsWith(':commit')) return Response.json({ writeResults: [] });
      return Response.json({ error: { status: 'NOT_FOUND', message: 'Unexpected URL.' } }, { status: 404 });
    }));

    await deleteEmptyZoneWithRest(auth, 'main', zone.id);

    expect(requests.find((request) => request.url.endsWith('/workspaces/main:runQuery'))?.body).toMatchObject({
      transaction: 'transaction-a',
      structuredQuery: { where: { fieldFilter: { value: { stringValue: zone.id } } }, limit: 1 }
    });
    expect(requests.find((request) => request.url.endsWith(':commit'))?.body).toMatchObject({
      transaction: 'transaction-a',
      writes: [{ delete: 'projects/athar-test/databases/(default)/documents/workspaces/main/zones/zone-a' }]
    });
  });

  it('refuses to delete a zone containing a building and rolls the transaction back', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith(':beginTransaction')) return Response.json({ transaction: 'transaction-b' });
      if (url.endsWith('/workspaces/main:runQuery')) return Response.json([{
        document: { name: 'projects/athar-test/databases/(default)/documents/workspaces/main/buildings/building-a' }
      }]);
      if (url.endsWith(':rollback')) return Response.json({});
      return Response.json({ error: { status: 'NOT_FOUND', message: 'Unexpected URL.' } }, { status: 404 });
    }));

    await expect(deleteEmptyZoneWithRest(auth, 'main', zone.id)).rejects.toBeInstanceOf(ZoneContainsBuildingsError);
    expect(requestedUrls.some((url) => url.endsWith(':rollback'))).toBe(true);
    expect(requestedUrls.some((url) => url.endsWith(':commit'))).toBe(false);
  });
});
