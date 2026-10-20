import type { RangeResponse, Source } from 'pmtiles';

// Individual tile/range budget; never retain an entire departmental archive in JS.
export const MAX_MAP_RANGE_BYTES = 8 * 1024 * 1024;

export async function boundedBody(response: Response, maximum: number, signal?: AbortSignal): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > maximum) { await response.body?.cancel(); throw new Error('Le serveur cartographique doit permettre la lecture par plages.'); }
  const reader = response.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('Réponse cartographique trop volumineuse. Rapproche la carte puis réessaie.');
      chunks.push(value);
    }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return buffer.buffer;
  } finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

/** Range reads online AND offline: the worker serves cached slices, never a full ArrayBuffer. */
export class LocalPmtilesSource implements Source {
  constructor(private readonly url: string, private readonly key: string = url) {}
  getKey(): string { return this.key; }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > MAX_MAP_RANGE_BYTES) throw new Error('Plage cartographique invalide ou trop volumineuse.');
    const response = await fetch(this.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` }, signal });
    if (!response.ok || /text\/html/i.test(response.headers.get('content-type') ?? '')) throw new Error('Carte indisponible. Vérifie la connexion ou la préparation hors ligne.');
    if (response.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
      if (!range || Number(range[1]) !== offset || Number(range[2]) < offset || Number(range[2]) >= offset + length) throw new Error('Plage cartographique incohérente. Réessaie.');
      const data = await boundedBody(response, length, signal);
      if (data.byteLength !== Number(range[2]) - offset + 1) throw new Error('Téléchargement cartographique incomplet.');
      return { data, etag: response.headers.get('etag') ?? undefined, cacheControl: response.headers.get('cache-control') ?? undefined, expires: response.headers.get('expires') ?? undefined };
    }
    // Small fixtures on hosts without Range can be read safely, without a retained archive.
    const data = await boundedBody(response, MAX_MAP_RANGE_BYTES, signal);
    if (offset >= data.byteLength) throw new Error('Plage cartographique absente.');
    return { data: data.slice(offset, offset + length) };
  }
}
