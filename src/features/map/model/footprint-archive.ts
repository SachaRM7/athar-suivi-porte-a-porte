/** Les sept premiers octets de toute archive PMTiles v3. */
const PMTILES_MAGIC = 'PMTiles';

/**
 * Première archive d'emprises réellement présente.
 *
 * Un hébergement SPA (Firebase Hosting `** → /index.html`, `vite preview`) répond 200 avec
 * la page HTML pour un fichier absent. Sans contrôle des octets magiques, cette page était
 * prise pour une archive, la lecture de son en-tête échouait (« Wrong magic number ») et
 * toute l'initialisation de la carte s'arrêtait : plus de zones, plus de bâtiments.
 */
export async function firstAvailableArchive(
  urls: readonly string[],
  fetcher: typeof fetch = (input, init) => fetch(input, init)
): Promise<string | null> {
  for (const url of urls) {
    try {
      const response = await fetcher(url, { headers: { Range: 'bytes=0-15' } });
      if (!response.ok && response.status !== 206) continue;
      const head = new Uint8Array(await response.arrayBuffer()).slice(0, PMTILES_MAGIC.length);
      if (String.fromCharCode(...head) === PMTILES_MAGIC) return url;
    } catch {
      // Archive suivante : l'absence du tuileset n'est pas une erreur de carte.
    }
  }
  return null;
}
