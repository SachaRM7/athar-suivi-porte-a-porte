import { describe, expect, it } from 'vitest';
import { canvasTiles } from './canvas-tiles';

describe('canvas tile reads', () => {
  it('covers the visible Toulouse area with a finite set of zoom 16 tiles', () => {
    const tiles = canvasTiles({ west: 1.444, east: 1.450, south: 43.604, north: 43.608 }, 16);
    expect(tiles).toContainEqual({ x: 33031, y: 23930, z: 16 });
    expect(tiles.length).toBeLessThan(10);
    expect(new Set(tiles.map(tile => `${tile.x}/${tile.y}`)).size).toBe(tiles.length);
  });
  it('refuses an archive-wide scan rather than allocating thousands of tiles', () => {
    expect(() => canvasTiles({ west: -180, east: 180, south: -90, north: 90 }, 16)).toThrow('Rapproche la carte');
  });
  it('clamps the north pole and the edge of the world to valid tile coordinates', () => {
    expect(canvasTiles({ west: 179.99, east: 180, south: 89, north: 90 }, 16)).toEqual([
      { x: 65534, y: 0, z: 16 }, { x: 65535, y: 0, z: 16 }
    ]);
  });
});
