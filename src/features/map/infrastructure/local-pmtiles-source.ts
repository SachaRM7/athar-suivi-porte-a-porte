import type { RangeResponse, Source } from 'pmtiles';

/**
 * Lit uniquement les plages utiles du fond Toulouse. Cette source laisse le
 * navigateur consulter le service worker sous Chromium/Windows, afin que la
 * carte preparee reste lisible sans reseau.
 */
export class LocalPmtilesSource implements Source {
  private preparedArchive: Promise<ArrayBuffer> | null = null;

  constructor(private readonly url: string, private readonly key: string) {}

  getKey(): string { return this.key; }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    if (this.preparedArchive) {
      const archive = await this.preparedArchive;
      return { data: archive.slice(offset, offset + length) };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.preparedArchive ??= fetch(this.url, { signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Offline PMTiles package unavailable: ${response.status}`);
        return response.arrayBuffer();
      });
      const archive = await this.preparedArchive;
      return { data: archive.slice(offset, offset + length) };
    }
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal
    });
    if (!response.ok) throw new Error(`Offline PMTiles package unavailable: ${response.status}`);
    const buffer = await response.arrayBuffer();
    // Repli pour un serveur qui ignore Range et renvoie l'archive entiÃ¨re.
    if (response.status === 200 && buffer.byteLength > length) this.preparedArchive = Promise.resolve(buffer);
    const data = this.preparedArchive ? buffer.slice(offset, offset + length) : buffer;
    return {
      data,
      cacheControl: response.headers.get('Cache-Control') ?? undefined,
      expires: response.headers.get('Expires') ?? undefined
    };
  }
}
