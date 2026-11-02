import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateUniformDoorTargets } from '../../domain/workspace/building-structure';
import { applyBuildingStructureWithRest } from './firestore-rest-building-structure';

const buildingDocument = {
  name: 'projects/athar-test/databases/(default)/documents/workspaces/main/buildings/building-detected',
  updateTime: '2026-08-09T16:00:00.000000Z',
  fields: {
    addressLabel: { stringValue: 'Bâtiment détecté' },
    location: { geoPointValue: { latitude: 43.61, longitude: 1.44 } },
    geohash: { stringValue: 'spc00' },
    zoneId: { stringValue: 'zone-a' },
    createdBy: { stringValue: 'member-a' },
    structureRevision: { integerValue: '0' }
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Firestore REST initial building structure', () => {
  it('commits the revision and twelve doors atomically with the member token', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/buildings/building-detected')) return Response.json(buildingDocument);
      if (url.endsWith('/workspaces/main:runQuery')) return Response.json([{}]);
      if (url.endsWith('/documents:commit')) return Response.json({ writeResults: [] });
      return Response.json({ error: { status: 'NOT_FOUND', message: 'Unexpected test URL.' } }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    let nextId = 0;

    const diff = await applyBuildingStructureWithRest(
      { projectId: 'athar-test', getIdToken: async () => 'member-token' },
      {
        workspaceId: 'main',
        buildingId: 'building-detected',
        expectedStructureRevision: 0,
        targets: generateUniformDoorTargets({ floorCount: 3, doorsPerFloor: 4, firstLabel: 101 }),
        authorId: 'member-a',
        createDoorId: () => `door-${nextId++}`
      }
    );

    expect(diff.created).toHaveLength(12);
    const commit = requests.find((request) => request.url.endsWith('/documents:commit'));
    expect(commit?.init?.headers).toMatchObject({ Authorization: 'Bearer member-token' });
    const body = JSON.parse(String(commit?.init?.body)) as { writes: unknown[] };
    expect(body.writes).toHaveLength(13);
    expect(body.writes[0]).toMatchObject({
      update: { fields: { structureRevision: { integerValue: '1' } } },
      currentDocument: { updateTime: buildingDocument.updateTime }
    });
  });

  it('keeps the Firestore status code when REST rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { error: { status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } },
      { status: 403 }
    )));

    await expect(applyBuildingStructureWithRest(
      { projectId: 'athar-test', getIdToken: async () => 'member-token' },
      {
        workspaceId: 'main', buildingId: 'building-detected', expectedStructureRevision: 0,
        targets: [], authorId: 'member-a', createDoorId: () => 'unused'
      }
    )).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

it('persiste le compartiment et le rattachement de la porte dans le même commit REST', async () => {
  let commitBody: { writes: Array<{ update: { fields: Record<string, unknown> }; updateMask?: { fieldPaths: string[] } }> } | undefined;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/buildings/building-detected')) return Response.json(buildingDocument);
    if (url.endsWith(':runQuery')) return Response.json([{}]);
    commitBody = JSON.parse(String(init?.body));
    return Response.json({ writeResults: [] });
  }));
  const diff = await applyBuildingStructureWithRest({ projectId: 'athar-test', getIdToken: async () => 'member-token' }, {
    workspaceId: 'main', buildingId: 'building-detected', expectedStructureRevision: 0,
    sectionId: 'hall-b', newSection: { id: 'hall-b', label: 'Hall B' },
    targets: [{ floor: 0, label: 'A01', sortOrder: 0 }], authorId: 'member-a', createDoorId: () => 'door-b'
  });
  expect(diff.created[0]).toMatchObject({ sectionId: 'hall-b', label: 'A01' });
  expect(commitBody!.writes[0].update.fields.sections).toEqual({ mapValue: { fields: { 'hall-b': { stringValue: 'Hall B' } } } });
  expect(commitBody!.writes[0].updateMask?.fieldPaths).toContain('sections');
  expect(commitBody!.writes[1].update.fields.sectionId).toEqual({ stringValue: 'hall-b' });
});
