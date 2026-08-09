import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDoorProfileWithRest, commitVisitWithRest } from './firestore-rest-door-writes';

const auth = { projectId: 'athar-test', getIdToken: async () => 'member-token' };
const doorDocument = {
  name: 'projects/athar-test/databases/(default)/documents/workspaces/main/doors/door-a',
  updateTime: '2026-08-09T20:00:00.000000Z',
  fields: {
    currentStatusId: { stringValue: 'unvisited' },
    revision: { integerValue: '0' },
    lastVisitId: { nullValue: null },
    lastVisitAt: { nullValue: null }
  }
};

afterEach(() => vi.unstubAllGlobals());

describe('Firestore REST door writes', () => {
  it('commits a visit and its door revision atomically', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/doors/door-a')) return Response.json(doorDocument);
      if (url.endsWith('/documents:commit')) return Response.json({ writeResults: [] });
      return Response.json({ error: { status: 'NOT_FOUND', message: 'Unexpected URL.' } }, { status: 404 });
    }));

    const snapshot = await commitVisitWithRest(auth, 'main', {
      commandId: 'visit-a', authorId: 'member-a', doorId: 'door-a', statusId: 'retry', note: '',
      expectedRevision: 0, createdAt: '2026-08-09T20:01:00.000Z'
    });

    expect(snapshot).toMatchObject({ id: 'door-a', currentStatusId: 'retry', revision: 1, lastVisitId: 'visit-a' });
    const commit = requests.find((request) => request.url.endsWith('/documents:commit'))!;
    expect(commit.init?.headers).toMatchObject({ Authorization: 'Bearer member-token' });
    const body = JSON.parse(String(commit.init?.body)) as { writes: unknown[] };
    expect(body.writes).toHaveLength(2);
    expect(body.writes[1]).toMatchObject({ currentDocument: { updateTime: doorDocument.updateTime } });
  });

  it('updates the household profile without touching the visit revision', async () => {
    let commitBody: unknown;
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      commitBody = JSON.parse(String(init?.body));
      return Response.json({ writeResults: [] });
    }));

    await applyDoorProfileWithRest(auth, 'main', {
      commandId: 'profile-a', authorId: 'member-a', doorId: 'door-a', foyer: 'couple', sisters: true,
      createdAt: '2026-08-09T20:02:00.000Z'
    });

    expect(commitBody).toMatchObject({ writes: [{
      update: { fields: { foyer: { stringValue: 'couple' }, aConfierAuxSoeurs: { booleanValue: true } } },
      updateMask: { fieldPaths: ['aConfierAuxSoeurs', 'foyer'] }
    }] });
  });
});
