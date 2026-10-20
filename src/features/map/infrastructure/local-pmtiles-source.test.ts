import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalPmtilesSource, MAX_MAP_RANGE_BYTES } from './local-pmtiles-source';
afterEach(() => vi.unstubAllGlobals());
describe('bounded PMTiles reads', () => {
  it('uses Range also offline, and retries a failed range without caching the rejection', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { 'content-range': 'bytes 10-12/100' } }));
    vi.stubGlobal('fetch', fetcher); const source = new LocalPmtilesSource('/map.pmtiles');
    await expect(source.getBytes(10, 3)).rejects.toThrow('offline'); expect(new Uint8Array((await source.getBytes(10, 3)).data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetcher.mock.calls[1][1].headers).toEqual({ Range: 'bytes=10-12' });
  });
  it('rejects an entire large archive when a server ignores Range', async () => {
    const cancel = vi.fn(); const stream = new ReadableStream({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-length': String(MAX_MAP_RANGE_BYTES + 1) } })));
    await expect(new LocalPmtilesSource('/map').getBytes(0, 8)).rejects.toThrow(); expect(cancel).toHaveBeenCalled();
  });
  it('rejects shifted or truncated partial responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 206, headers: { 'content-range': 'bytes 4-6/100' } })));
    await expect(new LocalPmtilesSource('/map').getBytes(4, 3)).rejects.toThrow();
  });
  it('rejects oversized requests before fetching', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new LocalPmtilesSource('/map').getBytes(0, MAX_MAP_RANGE_BYTES + 1)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
});
