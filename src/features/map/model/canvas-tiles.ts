import type { BoundingBox } from '../../../domain/workspace/models';

/** Only visible tiles, bounded even on an unusually large screen. No archive-wide scan. */
export function canvasTiles(bounds: BoundingBox, zoom: number, maximum = 64): { x: number; y: number; z: number }[] {
  const size = 2 ** zoom;
  const clamp = (value: number) => Math.max(0, Math.min(size - 1, Math.floor(value)));
  const x = (longitude: number) => clamp((longitude + 180) / 360 * size);
  const y = (latitude: number) => {
    const radians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
    return clamp((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * size);
  };
  const west = x(bounds.west), east = x(bounds.east), north = y(bounds.north), south = y(bounds.south);
  if ((east - west + 1) * (south - north + 1) > maximum) throw new Error('Rapproche la carte pour afficher les bâtiments.');
  const tiles = [];
  for (let column = west; column <= east; column++) {
    for (let row = north; row <= south; row++) tiles.push({ x: column, y: row, z: zoom });
  }
  return tiles;
}
