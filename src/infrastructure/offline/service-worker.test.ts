/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

function archiveBytes() {
  const bytes = new Uint8Array(200);
  bytes.set(new TextEncoder().encode('PMTiles'));
  bytes[7] = 3;
  return bytes;
}

function worker(fetcher: typeof fetch = async () => new Response(archiveBytes())) {
  const stores = new Map<string, Map<string, Response>>();
  const listeners: Record<string, (event: unknown) => void> = {};
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      const values = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, values);
      return {
        put: async (path: string, response: Response) => { values.set(path, response.clone()); },
        match: async (path: string) => values.get(path)?.clone(),
        delete: async (path: string) => values.delete(path)
      };
    }
  };
  const source = readFileSync('public/sw.js', 'utf8').replace("'__ATHAR_BUILD_VERSION__'", "'test'").replace('/* __ATHAR_LAZY_ASSETS__ */', "'/assets/lazy.js'");
  const api = runInNewContext(`${source}\n({ archiveInfo, mapResponse, inspectAssets, cacheAsset })`, {
    self: { registration: { scope: 'https://athar.test/' }, location: { origin: 'https://athar.test' }, addEventListener: (name: string, fn: (event: unknown) => void) => { listeners[name] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches, fetch: fetcher, URL, Response, Headers, TextDecoder, Uint8Array, DataView
  }) as {
    archiveInfo(response: Response): Promise<unknown>;
    mapResponse(request: Request, pathname: string): Promise<Response>;
    inspectAssets(): Promise<{ shell: boolean }>;
    cacheAsset(cache: unknown, path: string, generation: number): Promise<void>;
  };
  return { api, caches, listeners };
}

describe('offline worker integrity and range responses', () => {
  it('rejects the SPA HTML fallback and a truncated PMTiles body', async () => {
    const { api } = worker();
    await expect(api.archiveInfo(new Response('<html>SPA</html>'))).rejects.toThrow('invalide');
    const bytes = archiveBytes();
    new DataView(bytes.buffer).setBigUint64(64, 500n, true);
    await expect(api.archiveInfo(new Response(bytes))).rejects.toThrow('incomplète');
  });
  it('serves both archives offline and rejects impossible or multi-range requests', async () => {
    const { api, caches } = worker(async () => { throw new Error('offline'); });
    const cache = await caches.open('athar-maps-v1');
    for (const path of ['/fixtures/toulouse.pmtiles', '/tiles/batiments-31.pmtiles']) {
      await cache.put(path, new Response(archiveBytes()));
      const response = await api.mapResponse(new Request(`https://athar.test${path}`, { headers: { Range: 'bytes=0-126' } }), path);
      expect(response.status).toBe(206);
      expect((await response.arrayBuffer()).byteLength).toBe(127);
      for (const range of ['bytes=200-', 'bytes=10-2', 'bytes=0-2,4-6']) {
        expect((await api.mapResponse(new Request(`https://athar.test${path}`, { headers: { Range: range } }), path)).status).toBe(416);
      }
    }
  });
  it('requires every lazy chunk and propagates a storage failure', async () => {
    const { api, caches } = worker();
    expect((await api.inspectAssets()).shell).toBe(false);
    const cache = await caches.open('athar-shell-test');
    await expect(api.cacheAsset({ ...cache, put: async () => { throw new DOMException('full', 'QuotaExceededError'); } }, '/assets/lazy.js', 0)).rejects.toThrow('full');
  });
  it('does not recreate caches when sign-out interrupts a preparation', async () => {
    let release!: (value: Response) => void;
    const download = new Promise<Response>(resolve => { release = resolve; });
    const { caches, listeners } = worker(async path => String(path).endsWith('toulouse.pmtiles') ? download : new Response(archiveBytes()));
    let preparing!: Promise<void>;
    listeners.message({ data: { type: 'PREPARE_ZONE_ASSETS' }, ports: [], waitUntil: (promise: Promise<void>) => { preparing = promise; } });
    let purging!: Promise<void>;
    listeners.message({ data: { type: 'PURGE_ATHAR_DATA' }, ports: [], waitUntil: (promise: Promise<void>) => { purging = promise; } });
    release(new Response(archiveBytes()));
    await Promise.all([preparing, purging]);
    expect(await caches.keys()).toEqual([]);
  });
});
