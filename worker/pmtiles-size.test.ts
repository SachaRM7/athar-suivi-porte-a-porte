import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pmtilesTotalSize } from './pmtiles-size';

describe('PMTiles total size', () => {
  it('reads the archive length from its header', () => {
    const archive = readFileSync('public/fixtures/batiments-carmes.pmtiles');
    expect(pmtilesTotalSize(new Uint8Array(archive.subarray(0, 127)))).toBe(archive.length);
  });

  it('refuses something that is not a v3 archive', () => {
    expect(pmtilesTotalSize(new TextEncoder().encode('<!doctype html>'.padEnd(127, ' ')))).toBeNull();
    expect(pmtilesTotalSize(new Uint8Array(10))).toBeNull();
  });
});
