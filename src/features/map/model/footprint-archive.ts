/** Vérifie seulement l'en-tête : une réponse HTML 200 de la SPA n'est pas une archive. */
export async function firstAvailableArchive(
  urls: readonly string[],
  fetcher: typeof fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal
): Promise<string | null> {
  for (const url of urls) {
    if (signal?.aborted) return null;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 5_000);
    try {
      const response = await fetcher(url, { headers: { Range: 'bytes=0-15' }, signal: controller.signal });
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); continue; }
      const reader = response.body?.getReader();
      if (!reader) continue;
      const head = new Uint8Array(8);
      let count = 0;
      try {
        while (count < head.length) {
          const { value, done } = await reader.read();
          if (done) break;
          const part = value.subarray(0, head.length - count);
          head.set(part, count); count += part.length;
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      if (count === 8 && String.fromCharCode(...head.subarray(0, 7)) === 'PMTiles' && head[7] === 3) return url;
    } catch { /* Essayer l'archive de repli. */ }
    finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
  }
  return null;
}
