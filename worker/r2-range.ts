/**
 * Plage d'octets renvoyée par R2 (`R2Object.range`), sous ses trois formes possibles.
 * PMTiles lit le fond de carte par plages : chaque réponse partielle doit annoncer
 * exactement les octets qu'elle contient, sinon le service worker la refuse.
 */
export type R2Range = { offset?: number; length?: number; suffix?: number };

/** En-tête `Content-Range` d'une réponse 206, ou `null` si la réponse est complète. */
export function contentRange(range: R2Range | undefined, size: number): { header: string; length: number } | null {
  if (!range) return null;
  const offset = range.suffix !== undefined ? Math.max(0, size - range.suffix) : range.offset ?? 0;
  const length = range.suffix !== undefined ? size - offset : range.length ?? size - offset;
  if (offset === 0 && length === size) return null;
  return { header: `bytes ${offset}-${offset + length - 1}/${size}`, length };
}
