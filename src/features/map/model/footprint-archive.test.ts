import { describe, expect, it } from 'vitest';
import { firstAvailableArchive } from './footprint-archive';

function fakeFetch(bodies: Record<string, { status: number; body: string }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const entry = bodies[String(input)];
    if (!entry) throw new TypeError('Failed to fetch');
    return new Response(entry.body, { status: entry.status });
  }) as typeof fetch;
}

describe('footprint archive discovery', () => {
  it('skips the SPA fallback page served with HTTP 200 for a missing archive', async () => {
    const fetcher = fakeFetch({
      '/tiles/batiments-31.pmtiles': { status: 200, body: '<!doctype html><html>' },
      '/fixtures/batiments-carmes.pmtiles': { status: 206, body: 'PMTiles\u0003rest-of-header' }
    });
    await expect(firstAvailableArchive(['/tiles/batiments-31.pmtiles', '/fixtures/batiments-carmes.pmtiles'], fetcher))
      .resolves.toBe('/fixtures/batiments-carmes.pmtiles');
  });

  it('keeps the first real archive and returns nothing when none exists', async () => {
    const fetcher = fakeFetch({ '/a.pmtiles': { status: 206, body: 'PMTiles\u0003' }, '/b.pmtiles': { status: 404, body: '' } });
    await expect(firstAvailableArchive(['/a.pmtiles'], fetcher)).resolves.toBe('/a.pmtiles');
    await expect(firstAvailableArchive(['/b.pmtiles', '/missing.pmtiles'], fetcher)).resolves.toBeNull();
  });
});
