import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDoorProfileWithRest, commitVisitWithRest } from './firestore-rest-door-writes';
import { NetworkUnavailableError, RevisionConflictError, SyncRejectedError } from '../../domain/sync/sync-service';

const visit = {
  commandId: 'visit-a', authorId: 'member-a', doorId: 'door-a', statusId: 'retry', note: '',
  expectedRevision: 0, createdAt: '2026-08-09T20:01:00.000Z'
};

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

  it('keeps the intent pending when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const error = await commitVisitWithRest(auth, 'main', visit).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NetworkUnavailableError);
    expect((error as NetworkUnavailableError).reason).toBe('offline');
  });

  it('defers on a server outage and on an expired session instead of rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { status: 'UNAVAILABLE' } }, { status: 503 })));
    await expect(commitVisitWithRest(auth, 'main', visit)).rejects.toMatchObject({ name: 'NetworkUnavailableError', reason: 'server' });

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { status: 'UNAUTHENTICATED' } }, { status: 401 })));
    await expect(commitVisitWithRest(auth, 'main', visit)).rejects.toMatchObject({ name: 'NetworkUnavailableError', reason: 'session' });
  });

  it('classifies a security refusal of a suspended member as a visible rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/members/member-a')) return Response.json({ name: 'm', fields: { active: { booleanValue: false } } });
      return Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 });
    }));
    const error = await commitVisitWithRest(auth, 'main', visit).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SyncRejectedError);
    expect((error as SyncRejectedError).category).toBe('inactive-member');
  });

  it('reports a newer server revision as a conflict, never as an overwrite', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...doorDocument, fields: { ...doorDocument.fields, revision: { integerValue: '3' }, currentStatusId: { stringValue: 'do-not-return' } } })));
    await expect(commitVisitWithRest(auth, 'main', visit)).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it('recognises an already accepted visit after a lost response, without writing it twice', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ...doorDocument, fields: { currentStatusId: { stringValue: 'retry' }, revision: { integerValue: '1' }, lastVisitId: { stringValue: 'visit-a' }, lastVisitAt: { timestampValue: visit.createdAt } } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(commitVisitWithRest(auth, 'main', visit)).resolves.toMatchObject({ revision: 1, lastVisitId: 'visit-a' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('targets the Firestore emulator when the local origin is configured', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      if (String(input).endsWith('/doors/door-a')) return Response.json(doorDocument);
      return Response.json({ writeResults: [] });
    }));
    await commitVisitWithRest({ ...auth, origin: 'http://127.0.0.1:8180' }, 'main', visit);
    expect(urls.every((url) => url.startsWith('http://127.0.0.1:8180/v1/'))).toBe(true);
  });
});
