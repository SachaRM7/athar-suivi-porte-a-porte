import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';

/**
 * Towncenter map treatment ported from components/map/colors.ts and
 * components/map/TerritoryMap.tsx at commit 2572f4327e636295d1d453315c475ceb242cc1c1.
 * Towncenter is licensed under AGPL-3.0: https://github.com/fberrez/towncenter
 *
 * Athar keeps its local Protomaps/PMTiles source and its own 3D extrusion.
 */

export type MapPalette = {
  theme: 'light' | 'dark';
  ranks: [string, string, string, string, string];
  acc: string;
  accentMark: string;
  success: string;
  failure: string;
  text1: string;
  text2: string;
  text3: string;
  surface1: string;
  border1: string;
  border2: string;
  fond: string;
  map: {
    water: string;
    buildings: string;
    green: string;
    street: string;
    streetEdge: string;
    rail: string;
    boundary: string;
    label: string;
    labelHalo: string;
  };
};

/** Exact Towncenter dark-map tokens, exposed here as the style source of truth. */
export const TOWNCENTER_MAP_PALETTE: MapPalette = {
  theme: 'dark',
  ranks: ['#3689dd', '#3689dd', '#3689dd', '#3689dd', '#3689dd'],
  acc: '#6eb5ff',
  accentMark: '#3689dd',
  success: '#4eb068',
  failure: '#e66e68',
  text1: '#ebedef',
  text2: '#abaeb2',
  text3: '#909499',
  surface1: '#22262c',
  border1: '#2b3037',
  border2: '#3c424a',
  fond: '#080a0d',
  map: {
    water: '#0e1319',
    buildings: '#171b21',
    green: '#10151a',
    street: '#2b313a',
    streetEdge: '#171b21',
    rail: '#1b2027',
    boundary: '#343a42',
    label: '#abaeb2',
    labelHalo: '#080a0d',
  },
};

/** Single source of truth for the local basemap and preserved Athar extrusion. */
export const MAP_STYLE_CONFIG = {
  theme: TOWNCENTER_MAP_PALETTE.theme,
  language: 'fr',
  palette: TOWNCENTER_MAP_PALETTE,
  buildingSourceLayer: 'buildings',
  buildingMinZoom: 15,
  defaultBuildingHeight: 6,
  buildingLevelHeight: 3.2,
  buildingTileMaxZoom: 15,
  extrusion: { color: '#171b21', opacity: 0.98 },
  pointGlow: { color: '#6eb5ff', opacity: 0.52, blur: 0.82 },
} as const;

const protomapsFlavor: Flavor = namedFlavor(MAP_STYLE_CONFIG.theme);
const buildingHeight: ExpressionSpecification = [
  'case',
  ['has', 'height'], ['to-number', ['get', 'height']],
  ['has', 'levels'], ['*', ['to-number', ['get', 'levels']], MAP_STYLE_CONFIG.buildingLevelHeight],
  MAP_STYLE_CONFIG.defaultBuildingHeight,
];
const buildingBase: ExpressionSpecification = ['coalesce', ['to-number', ['get', 'min_height']], 0];

/**
 * Builds the local Protomaps layers. Towncenter's repaint is applied afterwards;
 * the Athar building layers are the only intentional extension.
 */
export function createBasemapLayers(source = 'protomaps', buildingSource = source): LayerSpecification[] {
  return layers(source, protomapsFlavor, { lang: MAP_STYLE_CONFIG.language }).flatMap((layer) => {
    if (layer.id !== 'buildings') return [layer];
    return [
      {
        ...layer,
        id: 'buildings-2d',
        source: buildingSource,
        maxzoom: MAP_STYLE_CONFIG.buildingMinZoom,
        paint: { ...layer.paint, 'fill-color': MAP_STYLE_CONFIG.palette.map.buildings, 'fill-opacity': 0.96 },
      } as unknown as LayerSpecification,
      {
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: buildingSource,
        'source-layer': MAP_STYLE_CONFIG.buildingSourceLayer,
        minzoom: MAP_STYLE_CONFIG.buildingMinZoom,
        filter: ['in', 'kind', 'building', 'building_part'],
        paint: {
          'fill-extrusion-color': MAP_STYLE_CONFIG.extrusion.color,
          'fill-extrusion-opacity': MAP_STYLE_CONFIG.extrusion.opacity,
          'fill-extrusion-base': buildingBase,
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14.8, 0, 15.8, buildingHeight],
          'fill-extrusion-vertical-gradient': true,
        },
      } as unknown as LayerSpecification,
    ];
  });
}

const HIDDEN_FAMILIES = new Set(['aeroway', 'aerodrome_label']);

/** Protomaps source-layer aliases for Towncenter's OpenMapTiles classifiers. */
function towncenterFamily(sourceLayer: string): string {
  switch (sourceLayer) {
    case 'buildings': return 'building';
    case 'landuse': return 'landcover';
    case 'roads': return 'transportation';
    case 'boundaries': return 'boundary';
    default: return sourceLayer;
  }
}

/** Exact Towncenter layer-by-layer basemap repaint, adapted to Protomaps names. */
export function stripBasemap(
  map: {
    getStyle: () => { layers?: readonly { id: string; type: string }[] };
    setPaintProperty: (id: string, property: string, value: unknown) => void;
    setLayoutProperty: (id: string, property: string, value: unknown) => void;
  },
  palette: MapPalette = TOWNCENTER_MAP_PALETTE,
): void {
  const styleLayers = map.getStyle().layers ?? [];
  const basemap = palette.map;

  for (const layer of styleLayers) {
    if (layer.id.startsWith('athar-')) continue;

    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'] ?? '';
    const family = towncenterFamily(sourceLayer);
    const hide = () => map.setLayoutProperty(layer.id, 'visibility', 'none');

    if (HIDDEN_FAMILIES.has(family) || layer.id.includes('shield')) {
      hide();
      continue;
    }

    switch (layer.type) {
      case 'background':
        map.setPaintProperty(layer.id, 'background-color', palette.fond);
        break;
      case 'fill': {
        const tint = family === 'water'
          ? basemap.water
          : family === 'building'
            ? basemap.buildings
            : family === 'park' || family === 'landcover'
              ? basemap.green
              : family === 'transportation'
                ? basemap.street
                : palette.fond;
        map.setPaintProperty(layer.id, 'fill-color', tint);
        if (family === 'building') map.setPaintProperty(layer.id, 'fill-outline-color', basemap.streetEdge);
        break;
      }
      case 'line': {
        const tint = family === 'water' || family === 'waterway'
          ? basemap.water
          : family === 'boundary'
            ? basemap.boundary
            : layer.id.includes('railway')
              ? basemap.rail
              : layer.id.includes('casing')
                ? basemap.streetEdge
                : basemap.street;
        map.setPaintProperty(layer.id, 'line-color', tint);
        break;
      }
      case 'symbol':
        map.setPaintProperty(layer.id, 'text-color', basemap.label);
        map.setPaintProperty(layer.id, 'text-halo-color', basemap.labelHalo);
        map.setPaintProperty(layer.id, 'text-halo-width', 1.4);
        map.setPaintProperty(layer.id, 'text-halo-blur', 0);
        break;
      default:
        break;
    }
  }
}

/**
 * Places basemap text above polygon overlays while keeping the named Athar
 * layer (normally the point glow) above every label.
 */
export function moveBasemapLabelsAboveOverlay(
  map: {
    getStyle: () => { layers?: readonly { id: string; type: string }[] };
    moveLayer: (id: string, beforeId?: string) => void;
  },
  beforeLayerId: string,
): void {
  const symbolLayerIds = (map.getStyle().layers ?? [])
    .filter((layer) => layer.type === 'symbol' && !layer.id.startsWith('athar-'))
    .map((layer) => layer.id);

  for (const layerId of symbolLayerIds) map.moveLayer(layerId, beforeLayerId);
}

const PATTERN_SIZE = 16;

/** Exact Towncenter sector hatch canvas. */
export function hatchPattern(color: string): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = PATTERN_SIZE;
  canvas.height = PATTERN_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.clearRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  context.lineCap = 'square';
  for (let start = -PATTERN_SIZE; start < PATTERN_SIZE * 2; start += 8) {
    context.beginPath();
    context.moveTo(start, 0);
    context.lineTo(start + PATTERN_SIZE, PATTERN_SIZE);
    context.stroke();
  }
  return context.getImageData(0, 0, PATTERN_SIZE, PATTERN_SIZE);
}

/** Exact Towncenter point-radius expression. */
export function targetRadius(factor: number): ExpressionSpecification {
  return [
    '+',
    ['*', ['/', ['get', 'diameter'], 2], factor],
    ['case', ['==', ['get', 'selected'], true], 5, 0],
  ];
}

/** Exact Towncenter point-fill expression. */
export function targetColor(palette: MapPalette = TOWNCENTER_MAP_PALETTE): ExpressionSpecification {
  return [
    'case',
    ['==', ['get', 'state'], 'taken'], palette.success,
    ['match', ['get', 'rank'],
      1, palette.ranks[0],
      2, palette.ranks[1],
      3, palette.ranks[2],
      4, palette.ranks[3],
      5, palette.ranks[4],
      palette.text3,
    ],
  ];
}

/** Exact Towncenter point-stroke expression. */
export function targetStroke(palette: MapPalette = TOWNCENTER_MAP_PALETTE): ExpressionSpecification {
  return [
    'case',
    ['==', ['get', 'state'], 'withdrawn'], palette.failure,
    ['==', ['get', 'selected'], true], palette.text1,
    palette.fond,
  ];
}
