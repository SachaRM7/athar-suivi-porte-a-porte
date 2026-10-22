/** Taille de l'en-tête PMTiles v3 : magie, version, puis huit entiers 64 bits. */
export const PMTILES_HEADER_BYTES = 127;

/**
 * Taille totale d'une archive PMTiles v3, déduite de son en-tête : la fin de la section la plus
 * lointaine (répertoire racine, métadonnées, feuilles, tuiles). `null` si ce n'est pas une archive.
 * R2 exige une longueur connue pour enregistrer un flux : c'est elle qu'on lui donne.
 */
export function pmtilesTotalSize(header: Uint8Array): number | null {
  if (header.length < PMTILES_HEADER_BYTES) return null;
  if (new TextDecoder().decode(header.subarray(0, 7)) !== 'PMTiles' || header[7] !== 3) return null;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  let total = PMTILES_HEADER_BYTES;
  for (let index = 0; index < 4; index++) {
    const offset = Number(view.getBigUint64(8 + index * 16, true));
    const length = Number(view.getBigUint64(16 + index * 16, true));
    total = Math.max(total, offset + length);
  }
  return Number.isSafeInteger(total) ? total : null;
}
