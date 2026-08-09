import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';

/**
 * Pile de couches prescrite par `03-CARTO.md`, du bas vers le haut. Le fond de carte
 * (couche 1) est ajouté avant celles-ci par `createBasemapLayers`.
 *
 * Contrainte de `03-CARTO.md` : le tuileset d'emprises n'existe qu'au zoom 16. En dessous,
 * seules la zone et sa progression agrégée restent visibles.
 */
export const FOOTPRINT_MIN_ZOOM = 16;

/** Jetons de `01-DESIGN-SYSTEM.md`. MapLibre n'accepte pas les variables CSS. */
const TOKENS = {
  brand: '#16324F',
  inkSoft: '#5C6663',
  paper: '#FCFCFB',
  accent: '#E0A106',
  footOut: '#DEE3DB',
  footTodo: '#CDD3CD',
  footTodoLine: '#B4BCB4',
  sisters: '#C25B7C'
} as const;

const IN_ZONE: ExpressionSpecification = ['boolean', ['feature-state', 'inZone'], false];
const TRACKED: ExpressionSpecification = ['boolean', ['feature-state', 'tracked'], false];
const SISTERS: ExpressionSpecification = ['boolean', ['feature-state', 'sisters'], false];
const STATUS_COLOR: ExpressionSpecification = ['to-color', ['coalesce', ['feature-state', 'color'], TOKENS.footTodo]];
const ZONE_COLOR: ExpressionSpecification = ['to-color', ['coalesce', ['get', 'color'], TOKENS.brand]];

/**
 * `feature-state` est interdit dans un `filter` MapLibre : l'appartenance à la zone et la
 * présence d'un document se traduisent donc en opacité, pas en filtre.
 */
function visibleWhen(condition: ExpressionSpecification, opacity = 1): ExpressionSpecification {
  return ['case', condition, opacity, 0];
}

const TODO: ExpressionSpecification = ['all', IN_ZONE, ['!', TRACKED]];
const SUIVI: ExpressionSpecification = ['all', IN_ZONE, TRACKED];

export const ATHAR_LAYERS = {
  zoneFill: 'athar-zone-fill',
  zoneLine: 'athar-zone-line',
  zoneProgress: 'athar-zone-progress',
  outOfZone: 'athar-batiments-hors-zone',
  todo: 'athar-batiments-todo',
  todoLine: 'athar-batiments-todo-contour',
  tracked: 'athar-batiments-suivis',
  trackedLine: 'athar-batiments-suivis-contour',
  local: 'athar-batiments-poses',
  localLine: 'athar-batiments-poses-contour',
  sisters: 'athar-batiments-soeurs',
  positionHalo: 'athar-position-halo',
  positionPoint: 'athar-position-point'
} as const;

/** Couches sur lesquelles un appui ouvre la vue bâtiment. Jamais `outOfZone`. */
export const CLICKABLE_FOOTPRINT_LAYERS: readonly string[] = [ATHAR_LAYERS.todo, ATHAR_LAYERS.tracked, ATHAR_LAYERS.local];

export type AtharLayerSources = {
  zones: string;
  /** `null` quand le tuileset d'emprises est absent : les couches 3 à 6 sont alors omises. */
  footprints: string | null;
  footprintSourceLayer?: string;
  localBuildings: string;
  position: string;
};

export function createAtharLayers(sources: AtharLayerSources): LayerSpecification[] {
  const footprint = (id: string, rest: Omit<LayerSpecification, 'id' | 'source'>): LayerSpecification[] => sources.footprints === null ? [] : [{
    id,
    source: sources.footprints,
    minzoom: FOOTPRINT_MIN_ZOOM,
    ...(sources.footprintSourceLayer ? { 'source-layer': sources.footprintSourceLayer } : {}),
    ...rest
  } as LayerSpecification];

  return [
    // 2 — polygone de la zone active.
    {
      id: ATHAR_LAYERS.zoneFill, type: 'fill', source: sources.zones,
      paint: { 'fill-color': ZONE_COLOR, 'fill-opacity': 0.04 }
    },
    {
      id: ATHAR_LAYERS.zoneLine, type: 'line', source: sources.zones,
      paint: { 'line-color': ZONE_COLOR, 'line-width': 2.5, 'line-opacity': 0.5, 'line-dasharray': [10, 7] }
    },
    // 3 — emprises hors zone : inertes, sans contour, non cliquables.
    ...footprint(ATHAR_LAYERS.outOfZone, {
      type: 'fill',
      paint: { 'fill-color': TOKENS.footOut, 'fill-opacity': visibleWhen(['!', IN_ZONE]) }
    }),
    // 4 — détectées dans la zone, aucun document Firestore.
    ...footprint(ATHAR_LAYERS.todo, {
      type: 'fill',
      paint: { 'fill-color': TOKENS.footTodo, 'fill-opacity': visibleWhen(TODO) }
    }),
    ...footprint(ATHAR_LAYERS.todoLine, {
      type: 'line',
      paint: { 'line-color': TOKENS.footTodoLine, 'line-width': 1.3, 'line-opacity': visibleWhen(TODO) }
    }),
    // 5 — suivies : couleur de statut alimentée par `feature-state` depuis Firestore.
    ...footprint(ATHAR_LAYERS.tracked, {
      type: 'fill',
      paint: { 'fill-color': STATUS_COLOR, 'fill-opacity': visibleWhen(SUIVI, 0.55) }
    }),
    ...footprint(ATHAR_LAYERS.trackedLine, {
      type: 'line',
      paint: { 'line-color': STATUS_COLOR, 'line-width': 1.3, 'line-opacity': visibleWhen(SUIVI) }
    }),
    // Bâtiments posés à la main : absents du RNB, donc absents du tuileset.
    {
      id: ATHAR_LAYERS.local, type: 'fill', source: sources.localBuildings, minzoom: FOOTPRINT_MIN_ZOOM,
      paint: { 'fill-color': ['to-color', ['get', 'color']], 'fill-opacity': 0.55 }
    },
    {
      id: ATHAR_LAYERS.localLine, type: 'line', source: sources.localBuildings, minzoom: FOOTPRINT_MIN_ZOOM,
      paint: { 'line-color': ['to-color', ['get', 'color']], 'line-width': 1.3 }
    },
    // 6 — marqueur « à confier aux sœurs » : anneau rose décalé, jamais un aplat.
    ...footprint(ATHAR_LAYERS.sisters, {
      type: 'line',
      paint: { 'line-color': TOKENS.sisters, 'line-width': 1.6, 'line-offset': 2.5, 'line-opacity': visibleWhen(SISTERS) }
    }),
    /*
     * Progression agrégée : seule lecture de la zone en dessous du zoom des emprises.
     * Elle passe au-dessus des libellés du fond, sinon les noms de rue la recouvrent.
     */
    {
      id: ATHAR_LAYERS.zoneProgress, type: 'symbol', source: sources.zones,
      maxzoom: FOOTPRINT_MIN_ZOOM,
      layout: { 'text-field': ['get', 'progressLabel'], 'text-font': ['Noto Sans Medium'], 'text-size': 12.5, 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': TOKENS.inkSoft, 'text-halo-color': TOKENS.paper, 'text-halo-width': 1.8 }
    },
    // 7 — position GPS : le safran ne sert qu'ici et sur l'action primaire.
    {
      id: ATHAR_LAYERS.positionHalo, type: 'circle', source: sources.position,
      paint: { 'circle-radius': 20, 'circle-color': TOKENS.accent, 'circle-opacity': 0.2 }
    },
    {
      id: ATHAR_LAYERS.positionPoint, type: 'circle', source: sources.position,
      paint: { 'circle-radius': 9, 'circle-color': TOKENS.accent, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3.5 }
    }
  ];
}
