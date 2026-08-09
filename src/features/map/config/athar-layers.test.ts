import { describe, expect, it } from 'vitest';
import { ATHAR_LAYERS, CLICKABLE_FOOTPRINT_LAYERS, createAtharLayers, FOOTPRINT_MIN_ZOOM } from './athar-layers';

const sources = { zones: 'z', footprints: 'f', footprintSourceLayer: 'batiments', localBuildings: 'l', position: 'p' };

describe('createAtharLayers', () => {
  it('stacks the layers in the order prescribed by 03-CARTO.md', () => {
    expect(createAtharLayers(sources).map((layer) => layer.id)).toEqual([
      ATHAR_LAYERS.zoneFill,
      ATHAR_LAYERS.zoneLine,
      ATHAR_LAYERS.outOfZone,
      ATHAR_LAYERS.todo,
      ATHAR_LAYERS.todoLine,
      ATHAR_LAYERS.tracked,
      ATHAR_LAYERS.trackedLine,
      ATHAR_LAYERS.local,
      ATHAR_LAYERS.localLine,
      ATHAR_LAYERS.sisters,
      ATHAR_LAYERS.zoneProgress,
      ATHAR_LAYERS.positionHalo,
      ATHAR_LAYERS.positionPoint
    ]);
  });

  it('hides every footprint layer below zoom 16 and keeps the zone readable', () => {
    const layers = createAtharLayers(sources);
    const zoneLayerIds: readonly string[] = [ATHAR_LAYERS.zoneFill, ATHAR_LAYERS.zoneLine, ATHAR_LAYERS.zoneProgress];
    const footprintLayers = layers.filter((layer) => !zoneLayerIds.includes(layer.id) && !layer.id.startsWith('athar-position'));
    expect(footprintLayers.every((layer) => layer.minzoom === FOOTPRINT_MIN_ZOOM)).toBe(true);
    expect(layers.find((layer) => layer.id === ATHAR_LAYERS.zoneFill)?.minzoom).toBeUndefined();
    expect(layers.find((layer) => layer.id === ATHAR_LAYERS.zoneProgress)?.maxzoom).toBe(FOOTPRINT_MIN_ZOOM);
  });

  it('never makes the out-of-zone footprints clickable', () => {
    expect(CLICKABLE_FOOTPRINT_LAYERS).not.toContain(ATHAR_LAYERS.outOfZone);
  });

  it('paints every zone with its persisted color', () => {
    const layers = createAtharLayers(sources);
    const expected = ['to-color', ['coalesce', ['get', 'color'], '#16324F']];
    expect(layers.find((layer) => layer.id === ATHAR_LAYERS.zoneFill)).toMatchObject({ paint: { 'fill-color': expected } });
    expect(layers.find((layer) => layer.id === ATHAR_LAYERS.zoneLine)).toMatchObject({ paint: { 'line-color': expected } });
  });

  it('omits the tileset layers when no footprint archive is available', () => {
    const ids = createAtharLayers({ ...sources, footprints: null }).map((layer) => layer.id);
    expect(ids).not.toContain(ATHAR_LAYERS.todo);
    expect(ids).not.toContain(ATHAR_LAYERS.outOfZone);
    expect(ids).toContain(ATHAR_LAYERS.zoneFill);
    expect(ids).toContain(ATHAR_LAYERS.local);
  });
});
