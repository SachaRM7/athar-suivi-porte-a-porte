import { Map as MapLibreMap, NavigationControl, addProtocol, type GeoJSONFeature, type GeoJSONSource, type Map as MapInstance } from 'maplibre-gl';
import { PMTiles, Protocol, SharedPromiseCache } from 'pmtiles';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { geohashForLocation } from 'geofire-common';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { withBasePath } from '../../../app/config/public-paths';
import type { Building, GeoPoint, Status, Zone, ZoneGeometry, ZoneStats } from '../../../domain/workspace/models';
import { zoneDoorProgress } from '../../../domain/workspace/zone-progress';
import { zoneProgressDate, zoneProgressSummary } from '../../zones/model/zone-progress-label';
import { isWorkspaceStatusId, WORKSPACE_VISUAL_STATUS } from '../../../domain/workspace/status-ids';
import { STATUS_LABEL, type DoorStatus } from '../../../design/status';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { assertZone } from '../../../domain/workspace/invariants';
import { boundingBoxForPolygon, buildingsAttachedToZone, closePolygon } from '../../zones/model/zone-geometry';
import {
  ATHAR_LAYERS,
  CLICKABLE_FOOTPRINT_LAYERS,
  createAtharLayers,
  FOOTPRINT_MIN_ZOOM,
} from '../config/athar-layers';
import {
  ATHAR_LIGHT_MAP_PALETTE,
  createBasemapLayers,
  MAP_STYLE_CONFIG,
  moveBasemapLabelsAboveOverlay,
  stripBasemap,
} from '../config/map-style';
import {
  centerOfRing,
  doorsByBuilding as groupDoorsByBuilding,
  dominantStatusId,
  footprintState,
  isInsideZone,
  squareAround,
  zoneProgressLabel,
  type FootprintContext,
} from '../model/footprints';
import {
  buildingAgeLabel,
  buildingListEntries,
  matchesBuildingListFilter,
  sortBuildingList,
    type BuildingListFilter,
  type BuildingListSort,
} from '../../buildings/model/building-staleness';
import { cadastralSuggestion, type CadastralSuggestion } from '../../buildings/model/cadastral-structure';
import { AccountMenu } from './AccountMenu';
import { footprintBuildingLabel, MANUAL_BUILDING_LABEL } from '../../buildings/model/building-address';
import type { SelectBuildingOptions } from '../model/use-opened-building';
import { LocalPmtilesSource } from '../infrastructure/local-pmtiles-source';
import { firstAvailableArchive } from '../model/footprint-archive';
import { matchesAddress, markingCandidates } from '../model/field-navigation';
import { Dialog, TraceBar } from '../../../design/components';
import { terrainSession } from '../model/terrain-session';
import 'maplibre-gl/dist/maplibre-gl.css';
import './terrain-shell.css';
import { useTerrainPage } from '../model/use-terrain-page';
import { loadBuildingDoors } from '../model/terrain-reads';
import { readTask, mapLimited } from '../../../shared/async/read-task';
import { locateOnce } from '../model/locate-once';

const protocol = new Protocol();
addProtocol('pmtiles', protocol.tile);
// Glyphs are bundled locally so street labels remain available after PWA preparation.
const DEFAULT_ZONE_COLOR = '#16835F';

/**
 * Tuileset d'emprises du lot WP6, conservé hors de Git ; l'échantillon versionné
 * `batiments-carmes.pmtiles` prend le relais pour que la carte reste vérifiable sans lui.
 */
export const TOULOUSE_FOOTPRINT_ARCHIVE = '/tiles/batiments-31.pmtiles';
export const DEMO_FOOTPRINT_ARCHIVE = '/fixtures/batiments-carmes.pmtiles';
const DEFAULT_FOOTPRINT_ARCHIVES = [TOULOUSE_FOOTPRINT_ARCHIVE, DEMO_FOOTPRINT_ARCHIVE] as const;
const FOOTPRINT_SOURCE = 'athar-batiments';
const FOOTPRINT_SOURCE_LAYER = 'batiments';
const ZONE_SOURCE = 'athar-zones';
const LOCAL_BUILDING_SOURCE = 'athar-batiments-poses';
const POSITION_SOURCE = 'athar-position';
/** Jeton `--foot-todo` : un bâtiment décrit mais sans passage reste gris. */
const UNTOUCHED_COLOR = '#CDD3CD';

const localMapStyle = {
  version: 8 as const,
  glyphs: withBasePath('/fonts/{fontstack}/{range}.pbf'),
  sources: {},
  layers: []
};

const EMPTY_FEATURES = { type: 'FeatureCollection' as const, features: [] };

type WorkspaceMapProps = {
  repositories: WorkspaceRepositories;
  authorId: string;
  syncNotice?: ReactNode;
  renderPreparation?: (zone: Zone) => ReactNode;
  canEditZones: boolean;
  initialZoneId?: string | null;
  canCreateBuildings?: boolean;
  /** Archives PMTiles essayées dans l'ordre ; la première disponible fournit les emprises. */
  footprintArchives?: readonly string[];
  onBuildingSelect?: (building: Building, options: SelectBuildingOptions) => void;
  /** Incrémenté quand un document disparaît ailleurs : la carte relit son cadrage. */
  reloadToken?: number;
  /** Absent hors session : la maquette et le laboratoire affichent la carte sans compte. */
  account?: { displayName: string; links?: readonly { label: string; href: string }[]; onOpenSettings(): void; onSignOut(): void };
};

/**
 * Le bloc `prefers-reduced-motion` de `tokens.css` ne couvre que les transitions CSS.
 * Un déplacement de caméra MapLibre est piloté en JavaScript : il doit consulter la
 * préférence lui-même, sinon la carte continue de glisser pour qui l'a désactivée.
 */
function motionDuration(milliseconds: number): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return milliseconds;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : milliseconds;
}

/**
 * Statut affiché pour un bâtiment : le même statut dominant que son emprise sur la carte.
 * La couleur ne porte que le statut ; l'ancienneté a sa propre colonne.
 */
function buildingVisualStatus(doors: readonly import('../../../domain/workspace/models').Door[]): DoorStatus {
  const statusId = dominantStatusId(doors);
  return statusId && isWorkspaceStatusId(statusId) ? WORKSPACE_VISUAL_STATUS[statusId] : 'todo';
}

/** Ordre des segments de la barre de couverture, du plus abouti au plus fragile. */
const COVERAGE_SEGMENTS: readonly { id: string; status: DoorStatus }[] = [
  { id: 'linked', status: 'linked' },
  { id: 'contacted', status: 'open' },
  { id: 'retry', status: 'away' },
  { id: 'locked', status: 'locked' },
  { id: 'do-not-return', status: 'dnd' }
];

const BUILDING_LIST_FILTERS: readonly { id: BuildingListFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'todo', label: 'Pas encore fait' },
  { id: 'stale', label: 'Pas vu > 3 mois' }
];

function zoneFeatures(zones: readonly Zone[], progressLabels: ReadonlyMap<string, string>): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((zone) => ({
      type: 'Feature' as const,
      properties: { id: zone.id, name: zone.name, color: zone.color, progressLabel: progressLabels.get(zone.id) ?? zone.name },
      geometry: { type: 'Polygon' as const, coordinates: [zone.geometry.coordinates.map(([longitude, latitude]) => [longitude, latitude])] }
    }))
  };
}

/** Emprises de repli pour les bâtiments posés à la main, absents du référentiel. */
function localBuildingFeatures(buildings: readonly Building[], context: FootprintContext): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection' as const,
    features: buildings.map((building) => {
      const statusId = dominantStatusId(context.doorsByBuilding.get(building.id) ?? []);
      return {
        type: 'Feature' as const,
        properties: {
          id: building.id,
          label: building.addressLabel,
          color: (statusId ? context.statuses.get(statusId)?.color : undefined) ?? UNTOUCHED_COLOR
        },
        geometry: { type: 'Polygon' as const, coordinates: [squareAround(building.location.longitude, building.location.latitude)] }
      };
    })
  };
}

function outerRing(feature: GeoJSONFeature): readonly [number, number][] | null {
  const geometry = feature.geometry;
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates[0]?.[0]
      : null;
  if (!ring || ring.length === 0) return null;
  return ring.map(([longitude, latitude]) => [longitude, latitude] as [number, number]);
}

function geometryFromFeature(feature: GeoJSONStoreFeatures): ZoneGeometry | null {
  if (feature.geometry.type !== 'Polygon') return null;
  const coordinates = feature.geometry.coordinates[0];
  if (!coordinates) return null;
  return closePolygon(coordinates.map(([longitude, latitude]) => [longitude, latitude] as [number, number]));
}

export function WorkspaceMap({ repositories, authorId, canEditZones, initialZoneId = null, canCreateBuildings = false, footprintArchives = DEFAULT_FOOTPRINT_ARCHIVES, onBuildingSelect, reloadToken = 0, account, syncNotice, renderPreparation }: WorkspaceMapProps): ReactElement {
  const element = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const map = useRef<MapInstance | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const viewportRequest = useRef<AbortController | null>(null);
  const placingBuilding = useRef(false);
  const zones = useRef<readonly Zone[]>([]);
  const selectedZoneRef = useRef<string | null>(initialZoneId);
  const footprintContext = useRef<FootprintContext>({ complete: false, zone: null, buildings: new Map(), doorsByBuilding: new Map(), statuses: new Map(), untouchedColor: UNTOUCHED_COLOR });
  /** Bâtiments posés pendant cette session, encore absents de Firestore. */
  const pendingLocalBuildings = useRef(new Map<string, Building>());
  /** Suggestions cadastrales lues sur les tuiles, indexées par ID-RNB. Jamais appliquées seules. */
  const footprintSuggestions = useRef(new Map<string, CadastralSuggestion>());
  const [zoneList, setZoneList] = useState<readonly Zone[]>([]);
  const [zoneStats, setZoneStats] = useState<ReadonlyMap<string, ZoneStats | null>>(new Map());
  const [listFilter, setListFilter] = useState<BuildingListFilter>('all');
  const [listSort, setListSort] = useState<BuildingListSort>('staleness');
  const [searchQuery, setSearchQuery] = useState('');
  const [markingOpen, setMarkingOpen] = useState(false);
  const [markingSearch, setMarkingSearch] = useState('');
  const [markingCentre, setMarkingCentre] = useState<GeoPoint>({ latitude: 43.6064, longitude: 1.4468 });
  const lastBuilding = useRef<string | null>(null);
  const [mode, setMode] = useState<'terrain' | 'edition'>('terrain');
  const [panelHeight, setPanelHeight] = useState<'peek' | 'full'>('peek');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(initialZoneId);
  const loadedZoneId = zoneList.some(zone => zone.id === selectedZoneId) ? selectedZoneId : null;
  const terrainPage = useTerrainPage(repositories, loadedZoneId, reloadToken);
  const listDoorGroups = useMemo(() => groupDoorsByBuilding(terrainPage.doors), [terrainPage.doors]);
  const zoneBuildings = useMemo(() => buildingListEntries(terrainPage.buildings, listDoorGroups), [terrainPage.buildings, listDoorGroups]);
  const session = useMemo(() => terrainSession(terrainPage.doors), [terrainPage.doors]);
  const [zoneMenuOpen, setZoneMenuOpen] = useState(false);
  const zonePicker = useRef<HTMLDivElement>(null);
  const [visibleBuildingCount, setVisibleBuildingCount] = useState(0);
  const [editing, setEditing] = useState<'drawing' | 'editing' | null>(null);
  const [placing, setPlacing] = useState(false);
  /** Après « Choisir une emprise sur la carte » : la consigne reste affichée jusqu'à l'appui. */
  const [pickingFootprint, setPickingFootprint] = useState(false);
  /**
   * `null` signifie « pas encore touché » : les champs reflètent alors la zone sélectionnée.
   * Les brouillons sont dérivés au rendu plutôt que recopiés par un effet, sinon chaque
   * changement de sélection déclencherait un rendu en cascade.
   */
  const [zoneDraft, setZoneDraft] = useState<{ name: string; color: string } | null>(null);
  const [savingZone, setSavingZone] = useState(false);
  const [message, setMessage] = useState('Chargement de la carte…');
  const [mapError, setMapError] = useState(false);
  const [mapVersion, setMapVersion] = useState(0);
  const [metadataError, setMetadataError] = useState(false);
  const [viewportPartial, setViewportPartial] = useState(false);
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef<AbortController | null>(null);
  const metadata = useRef<Promise<{ nextZones: readonly Zone[]; statuses: readonly Status[] }> | null>(null);
  const paintedIds = useRef(new Set<string>());
  const [confirmZoneDeletion, setConfirmZoneDeletion] = useState(false);

  const selectedZone = zoneList.find((zone) => zone.id === selectedZoneId) ?? null;
  const normalizedSearch = searchQuery.trim();
  const candidates = markingCandidates(zoneBuildings, markingCentre);
  const listReady = terrainPage.phase === 'ready' && loadedZoneId !== null;
  const listedBuildings = sortBuildingList(
    zoneBuildings.filter((entry) => (
      matchesBuildingListFilter(entry, listFilter)
      && matchesAddress(entry.building.addressLabel, normalizedSearch)
    )),
    listSort
  );
  const draftZoneName = zoneDraft?.name ?? selectedZone?.name ?? '';
  const draftZoneColor = zoneDraft?.color ?? selectedZone?.color ?? DEFAULT_ZONE_COLOR;

  /**
   * Un seul état ouvert à la fois en haut de l'écran : changer de mode replie la liste et
   * ferme le menu de zone. Sur mobile, l'Édition masque la liste (cf. `terrain-shell.css`).
   */
  const switchMode = (next: 'terrain' | 'edition') => {
    setMode(next);
    setPanelHeight('peek');
    setZoneMenuOpen(false);
  };

  const selectZone = (zoneId: string | null) => {
    setSelectedZoneId(zoneId);
    setZoneDraft(null);
    setMarkingOpen(false);
  };

  useEffect(() => { selectedZoneRef.current = selectedZoneId; }, [selectedZoneId]);

  useEffect(() => {
    if (!zoneMenuOpen) return undefined;
    const dismiss = (event: MouseEvent): void => {
      if (zonePicker.current && !zonePicker.current.contains(event.target as Node)) setZoneMenuOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setZoneMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [zoneMenuOpen]);

  /**
   * Téléportation vers une zone. Consultation pure : cadrer une zone ne l'assigne à
   * personne et n'écrit rien. Chaque membre peut donc regarder n'importe quel secteur.
   */
  /**
   * La liste couvre toute la zone : un bâtiment choisi peut être hors du cadrage. On amène
   * donc la carte sur lui, à un zoom où les emprises sont dessinées.
   */
  const flyToBuilding = (building: Building): void => {
    const instance = map.current;
    if (!instance) return;
    instance.easeTo({
      center: [building.location.longitude, building.location.latitude],
      zoom: Math.max(instance.getZoom(), FOOTPRINT_MIN_ZOOM + 0.4),
      duration: motionDuration(600)
    });
  };

  const flyToZone = (zone: Zone): void => {
    setZoneMenuOpen(false);
    selectZone(zone.id);
    map.current?.fitBounds(
      [[zone.bbox.west, zone.bbox.south], [zone.bbox.east, zone.bbox.north]],
      { padding: 64, duration: motionDuration(700) }
    );
  };

  /**
   * Alimente `feature-state` depuis Firestore. Une emprise sans document reste grise :
   * aucune écriture n'est déclenchée ici, ni au survol, ni à l'appui.
   */
  const paintFootprints = useCallback(() => {
    const instance = map.current;
    if (!instance) return;
    const context = footprintContext.current;
    const tiled = new Set<string>();
    footprintSuggestions.current.clear();
    try {
      if (instance.getSource(FOOTPRINT_SOURCE)) {
        for (const feature of instance.querySourceFeatures(FOOTPRINT_SOURCE, { sourceLayer: FOOTPRINT_SOURCE_LAYER })) {
          const rnbId = feature.properties?.rnb_id;
          if (typeof rnbId !== 'string' || tiled.has(rnbId)) continue;
          const ring = outerRing(feature);
          if (!ring) continue;
          tiled.add(rnbId);
          const suggestion = cadastralSuggestion(feature.properties);
          if (suggestion) footprintSuggestions.current.set(rnbId, suggestion);
          instance.setFeatureState(
            { source: FOOTPRINT_SOURCE, sourceLayer: FOOTPRINT_SOURCE_LAYER, id: rnbId },
            footprintState(rnbId, centerOfRing(ring), context)
          );
        }
      }
    } catch {
      // Tuiles pas encore chargées : le prochain « sourcedata » repassera.
    }
    if (instance.getSource(FOOTPRINT_SOURCE)) {
      for (const id of paintedIds.current) if (!tiled.has(id)) instance.removeFeatureState({ source: FOOTPRINT_SOURCE, sourceLayer: FOOTPRINT_SOURCE_LAYER, id });
    }
    paintedIds.current = tiled;
    const localCandidates = new Map(context.buildings);
    for (const [id, building] of pendingLocalBuildings.current) localCandidates.set(id, building);
    const untiled = [...localCandidates.values()].filter((building) => !tiled.has(building.id));
    (instance.getSource(LOCAL_BUILDING_SOURCE) as GeoJSONSource | undefined)?.setData(localBuildingFeatures(untiled, context));
    element.current?.setAttribute('data-footprints', String(tiled.size));
  }, []);

  const ensureMetadata = useCallback(() => {
    metadata.current ??= (async () => {
      const [nextZones, statuses] = await readTask(Promise.all([repositories.zones.list(), repositories.statuses.list()]));
      zones.current = nextZones;
      setZoneList(nextZones);
      // Une liste vide peut venir du cache local après une lecture serveur coupée (réseau
      // instable, cache purgé à la déconnexion) : on ne la retient pas, la prochaine lecture
      // réinterroge le serveur.
      if (nextZones.length === 0) metadata.current = null;
      setMetadataError(false);
      const requested = selectedZoneRef.current;
      const active = nextZones.some(zone => zone.id === requested) ? requested : nextZones[0]?.id ?? null;
      selectedZoneRef.current = active;
      setSelectedZoneId(active);
      // Production subscribes once; panning does not reread every zone projection.
      if (!repositories.zones.subscribeStats) {
        const stats = await mapLimited(nextZones, 4, new AbortController().signal, async zone => {
          try { return [zone.id, await readTask(repositories.zones.getStats(zone.id))] as const; }
          catch { return [zone.id, null] as const; }
        });
        setZoneStats(new Map(stats));
      }
      return { nextZones, statuses };
    })().catch(error => { metadata.current = null; setMetadataError(true); throw error; });
    return metadata.current;
  }, [repositories]);

  const refreshViewport = useCallback(async () => {
    const instance = map.current;
    if (!instance) return;
    viewportRequest.current?.abort();
    const controller = new AbortController();
    viewportRequest.current = controller;
    const bounds = instance.getBounds();
    const viewport = { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() };
    element.current?.setAttribute('data-viewport', JSON.stringify(viewport));
    const { nextZones, statuses } = await ensureMetadata();
    if (controller.signal.aborted) return;
    const context: FootprintContext = {
      zone: nextZones.find(zone => zone.id === selectedZoneRef.current) ?? null,
      buildings: new Map(), doorsByBuilding: new Map(), statuses: new Map(statuses.map(status => [status.id, status])), untouchedColor: UNTOUCHED_COLOR, complete: false
    };
    footprintContext.current = context;
    setVisibleBuildingCount(0);
    setViewportPartial(false);
    paintFootprints();
    if (instance.getZoom() < FOOTPRINT_MIN_ZOOM) return;
    const buildings = new Map<string, Building>();
    const doorGroups = new Map<string, readonly import('../../../domain/workspace/models').Door[]>();
    let cursor: string | null = null;
    let reads = 0;
    let documentsRead = 0;
    let completeSource = true;
    const seen = new Set<string>();
    let timedOut = false;
    const deadline = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    try {
      do {
        const page: import('../../../domain/workspace/read-pagination').ReadPage<Building> = await readTask(repositories.buildings.listPageByViewport(viewport, { cursor, pageSize: Math.min(25, 200 - buildings.size), signal: controller.signal }), controller.signal);
        completeSource = completeSource && page.metrics.fromCache !== true;
        const fresh = page.items.filter(building => !buildings.has(building.id));
        const result = await loadBuildingDoors(repositories, fresh, controller.signal);
        documentsRead += page.metrics.documentsRead + result.documentsRead;
        if (documentsRead > 10_000) throw new Error('Lecture trop volumineuse. Rapproche la carte.');
        if (viewportRequest.current !== controller || controller.signal.aborted) return;
        for (const building of fresh) buildings.set(building.id, building);
        for (const [id, doors] of groupDoorsByBuilding(result.doors)) doorGroups.set(id, doors);
        cursor = page.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error('Lecture cartographique interrompue.');
        if (cursor) seen.add(cursor);
        footprintContext.current = { ...context, zone: zones.current.find(zone => zone.id === selectedZoneRef.current) ?? null, buildings: new Map(buildings), doorsByBuilding: new Map(doorGroups), complete: cursor === null && completeSource };
        setVisibleBuildingCount(buildings.size);
        setViewportPartial(cursor !== null || !completeSource);
        element.current?.setAttribute('data-documents-read', String(documentsRead));
        paintFootprints();
      } while (cursor && ++reads < 40 && buildings.size < 200);
    } catch (error) {
      if (viewportRequest.current === controller && (timedOut || !controller.signal.aborted)) {
        setViewportPartial(true);
        setMessage('Données de carte incomplètes. Rapproche la carte ou réessaie ; la liste reste accessible.');
      }
      throw error;
    } finally { window.clearTimeout(deadline); }
  }, [ensureMetadata, paintFootprints, repositories]);

  useEffect(() => {
    metadata.current = null;
    void ensureMetadata().then(() => refreshViewport()).catch(() => undefined);
  }, [reloadToken, ensureMetadata, refreshViewport]);

  const reloadZones = useCallback(() => {
    metadata.current = null;
    void ensureMetadata().then(() => refreshViewport()).catch(() => undefined);
  }, [ensureMetadata, refreshViewport]);

  /** Le réseau revient : une liste de zones vide ou en échec est relue sans attendre un geste. */
  useEffect(() => {
    const retry = () => { if (zones.current.length === 0) reloadZones(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [reloadZones]);

  const statsZoneIds = zoneList.map(zone => zone.id).sort().join('|');
  useEffect(() => {
    const stop = statsZoneIds.split('|').filter(Boolean).map(id => repositories.zones.subscribeStats?.(id,
      stats => setZoneStats(current => new Map(current).set(id, stats)),
      () => setZoneStats(current => new Map(current).set(id, null))));
    return () => { stop.forEach(unsubscribe => unsubscribe?.()); };
  }, [repositories, statsZoneIds]);
  useEffect(() => {
    (map.current?.getSource(ZONE_SOURCE) as GeoJSONSource | undefined)?.setData(zoneFeatures(zones.current,
      new Map(zones.current.map(zone => [zone.id, zoneProgressLabel(zone, zoneStats.get(zone.id) ?? null)]))));
  }, [zoneStats]);

  /**
   * Un appui sur une emprise ouvre la vue bâtiment, jamais un formulaire de création :
   * l'emprise existe déjà. Sans document Firestore, la fiche s'ouvre sur l'état vide et
   * le bâtiment n'est matérialisé qu'au moment où quelqu'un décrit sa structure.
   */
  const openFootprint = useCallback(async (feature: GeoJSONFeature) => {
    const identifier = feature.properties?.rnb_id ?? feature.properties?.id;
    if (typeof identifier !== 'string') return;
    // La suggestion cadastrale voyage avec l'emprise : elle pré-remplit le dialogue de
    // structure sans jamais créer de porte, cf. `03-CARTO.md`.
    const suggestion = cadastralSuggestion(feature.properties) ?? footprintSuggestions.current.get(identifier) ?? null;
    const existing = await readTask(repositories.buildings.get(identifier));
    if (existing) {
      lastBuilding.current = existing.id;
      onBuildingSelect?.(existing, { persisted: true, suggestion });
      return;
    }
    const zone = footprintContext.current.zone;
    const ring = outerRing(feature);
    if (!zone || !ring) return;
    lastBuilding.current = identifier;
    const [longitude, latitude] = centerOfRing(ring);
    onBuildingSelect?.({
      id: identifier,
      // Le tuileset ne porte aucune adresse et `03-CARTO.md` écarte le géocodage : l'ID-RNB
      // tient lieu d'étiquette jusqu'à ce que quelqu'un saisisse l'adresse dans la fiche.
      addressLabel: typeof feature.properties?.label === 'string' ? feature.properties.label : footprintBuildingLabel(identifier),
      location: { latitude, longitude },
      geohash: geohashForLocation([latitude, longitude]),
      zoneId: zone.id,
      createdBy: authorId,
      structureRevision: 0
    }, { persisted: false, suggestion });
  }, [authorId, onBuildingSelect, repositories.buildings]);

  useEffect(() => {
    if (!element.current || map.current) return;
    // Un nouvel essai doit aussi oublier les promesses PMTiles rejetées.
    const archive = new PMTiles(new LocalPmtilesSource(withBasePath('/fixtures/toulouse.pmtiles'), 'athar-toulouse-local'), new SharedPromiseCache(64));
    protocol.add(archive);
    const suggestions = footprintSuggestions.current;
    let instance: MapLibreMap;
    try { instance = new MapLibreMap({
      container: element.current,
      // Zoom 16 minimum : en dessous, `03-CARTO.md` n'affiche plus les emprises individuelles.
      center: [1.4468, 43.6064], zoom: 16.1, pitch: 0, bearing: 0,
      attributionControl: { compact: true },
      style: localMapStyle, maxTileCacheSize: 64, maxTileCacheZoomLevels: 2
    });
    } catch { queueMicrotask(() => setMapError(true)); return; }
    map.current = instance;
    element.current.dataset.basemap = 'local-pmtiles';
    let disposed = false;
    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    const initRequest = new AbortController();
    const mapFailed = () => { if (!disposed) { setMapError(true); setMessage('Carte indisponible. Réessaie ou utilise la liste des bâtiments.'); } };
    instance.on('error', mapFailed);
    instance.getCanvas().addEventListener('webglcontextlost', mapFailed);
    const initializeWorkspaceLayers = async () => {
      if (instance.getSource(ZONE_SOURCE)) return;
      {
        const header = await readTask(archive.getHeader(), initRequest.signal);
        if (disposed) return;
        instance.addSource('protomaps', {
          type: 'vector', tiles: ['pmtiles://athar-toulouse-local/{z}/{x}/{y}'],
          minzoom: header.minZoom, maxzoom: header.maxZoom,
          bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
          attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        });
        instance.addSource('protomaps-buildings', {
          type: 'vector', tiles: ['pmtiles://athar-toulouse-local/{z}/{x}/{y}'],
          minzoom: header.minZoom, maxzoom: Math.min(header.maxZoom, MAP_STYLE_CONFIG.buildingTileMaxZoom),
          bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat]
        });
        createBasemapLayers('protomaps', 'protomaps-buildings', { palette: ATHAR_LIGHT_MAP_PALETTE, flat: true })
          .forEach((layer) => instance.addLayer(layer));
        stripBasemap(instance, ATHAR_LIGHT_MAP_PALETTE);
      }

      instance.addSource(ZONE_SOURCE, { type: 'geojson', data: zoneFeatures([], new Map()) });
      instance.addSource(LOCAL_BUILDING_SOURCE, { type: 'geojson', data: EMPTY_FEATURES });
      instance.addSource(POSITION_SOURCE, { type: 'geojson', data: EMPTY_FEATURES });

      const footprintArchiveUrl = await firstAvailableArchive(footprintArchives.map((path) => withBasePath(path as `/${string}`)), undefined, initRequest.signal);
      if (disposed) return;
      if (footprintArchiveUrl) {
        const footprints = new PMTiles(new LocalPmtilesSource(footprintArchiveUrl, footprintArchiveUrl), new SharedPromiseCache(64));
        protocol.add(footprints);
        const header = await readTask(footprints.getHeader(), initRequest.signal);
        if (disposed) return;
        instance.addSource(FOOTPRINT_SOURCE, {
          type: 'vector',
          tiles: [`pmtiles://${footprintArchiveUrl}/{z}/{x}/{y}`],
          minzoom: header.minZoom, maxzoom: header.maxZoom,
          bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
          // L'ID-RNB devient l'identifiant MapLibre : c'est la clé de `feature-state`.
          promoteId: { [FOOTPRINT_SOURCE_LAYER]: 'rnb_id' }
        });
      }

      createAtharLayers({
        zones: ZONE_SOURCE,
        footprints: footprintArchiveUrl ? FOOTPRINT_SOURCE : null,
        footprintSourceLayer: FOOTPRINT_SOURCE_LAYER,
        localBuildings: LOCAL_BUILDING_SOURCE,
        position: POSITION_SOURCE
      }).forEach((layer) => instance.addLayer(layer));
      // Les libellés du fond passent au-dessus des emprises, mais sous la progression de zone.
      moveBasemapLabelsAboveOverlay(instance, ATHAR_LAYERS.zoneProgress);
      if (!footprintArchiveUrl) {
        setMessage('Emprises indisponibles. Les bâtiments déjà suivis restent accessibles dans la liste.');
      }

      for (const layerId of CLICKABLE_FOOTPRINT_LAYERS) {
        if (!instance.getLayer(layerId)) continue;
        instance.on('mouseenter', layerId, () => { if (!placingBuilding.current) instance.getCanvas().style.cursor = 'pointer'; });
        instance.on('mouseleave', layerId, () => { if (!placingBuilding.current) instance.getCanvas().style.cursor = ''; });
      }

      instance.on('click', (event) => {
        if (placingBuilding.current) {
          placingBuilding.current = false;
          setPlacing(false);
          instance.getCanvas().style.cursor = '';
          const zone = footprintContext.current.zone;
          if (!zone) {
            setMessage('Choisis une zone avant de poser un bâtiment.');
            return;
          }
          const location: GeoPoint = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
          const building: Building = {
            id: `local_${crypto.randomUUID()}`,
            addressLabel: MANUAL_BUILDING_LABEL,
            location,
            geohash: geohashForLocation([location.latitude, location.longitude]),
            zoneId: zone.id,
            createdBy: authorId,
            structureRevision: 0
          };
          pendingLocalBuildings.current.set(building.id, building);
          if (pendingLocalBuildings.current.size > 25) pendingLocalBuildings.current.delete(pendingLocalBuildings.current.keys().next().value!);
          paintFootprints();
          setMode('terrain');
          onBuildingSelect?.(building, { persisted: false, suggestion: null });
          setMessage('Bâtiment local posé. Décris sa structure pour l’enregistrer.');
          return;
        }
        const activeZone = footprintContext.current.zone;
        if (!isInsideZone(activeZone, [event.lngLat.lng, event.lngLat.lat])) return;
        const layers = CLICKABLE_FOOTPRINT_LAYERS.filter((layerId) => instance.getLayer(layerId));
        const hit = instance.queryRenderedFeatures(event.point, { layers })
          // Les emprises hors zone sont inertes : elles partagent la source mais pas l'appui.
          .find((feature) => feature.source === LOCAL_BUILDING_SOURCE || feature.state?.inZone === true);
        // Appui dans le vide : aucune création, aucune écriture.
        if (!hit) return;
        setPickingFootprint(false);
        void openFootprint(hit).catch(() => setMessage('Bâtiment indisponible. Vérifie le réseau ou la préparation hors ligne puis réessaie.'));
      });

      // paintFootprints met à jour une source GeoJSON, ce qui déclenche un nouveau rendu.
      // L'appeler sur « idle » entretiendrait une boucle de rendu permanente, même immobile.
      // Les tuiles chargées et les lectures du viewport déclenchent déjà cette mise à jour.
      instance.on('sourcedata', (event) => { if (event.sourceId === FOOTPRINT_SOURCE && event.isSourceLoaded) paintFootprints(); });
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      setMapError(false);
      // Une carte prête n'a rien à annoncer : la ligne d'état reste libre pour les vrais retours.
      setMessage((current) => current.startsWith('Emprises indisponibles') ? current : '');
      void refreshViewport().catch((error) => { if (!(error instanceof Error) || error.name !== 'ReadAbortedError') setMessage('Données de carte incomplètes. Rapproche la carte ou réessaie.'); });
    };
    const initializeAfterStyleLoad = () => {
      void initializeWorkspaceLayers().catch((error: unknown) => {
        void error; mapFailed();
      });
    };
    if (instance.isStyleLoaded()) initializeAfterStyleLoad();
    else instance.once('style.load', initializeAfterStyleLoad);
    instance.on('moveend', () => {
      viewportRequest.current?.abort();
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => { void refreshViewport().catch(() => undefined); }, 180);
    });
    return () => {
      disposed = true; initRequest.abort(); clearTimeout(moveTimer); viewportRequest.current?.abort();
      draw.current?.stop(); draw.current = null; instance.remove(); map.current = null;
      suggestions.clear(); paintedIds.current.clear();
    };
  }, [authorId, footprintArchives, onBuildingSelect, openFootprint, paintFootprints, refreshViewport, mapVersion]);

  const locate = async () => {
    if (!navigator.geolocation) { setMessage('Ce navigateur ne propose pas la localisation. Continue avec la carte.'); return; }
    locationRequest.current?.abort();
    const controller = new AbortController(); locationRequest.current = controller;
    setLocating(true); setMessage('Recherche de ta position…');
    try {
      const position = await locateOnce(navigator.geolocation, controller.signal);
      if (controller.signal.aborted) return;
      const data: FeatureCollection<Point> = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] } }] };
      (map.current?.getSource(POSITION_SOURCE) as GeoJSONSource | undefined)?.setData(data);
      map.current?.easeTo({ center: [position.longitude, position.latitude], zoom: Math.max(map.current.getZoom(), FOOTPRINT_MIN_ZOOM + .4), duration: motionDuration(450) });
      setMessage(`Position relevée · précision d’environ ${Math.ceil(position.accuracy)} m. Le suivi GPS est arrêté.`);
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Position indisponible. Réessaie.'); }
    finally { if (locationRequest.current === controller) setLocating(false); }
  };
  useEffect(() => {
    const current = locationRequest;
    const pause = () => { if (document.visibilityState === 'hidden') { current.current?.abort(); setLocating(false); } };
    document.addEventListener('visibilitychange', pause);
    return () => { document.removeEventListener('visibilitychange', pause); current.current?.abort(); };
  }, []);

  /** Le changement de zone active redéfinit ce qui est « dans la zone ». */
  useEffect(() => {
    const zone = zones.current.find((candidate) => candidate.id === selectedZoneId) ?? null;
    if (footprintContext.current.zone?.id === zone?.id) return;
    footprintContext.current = { ...footprintContext.current, zone };
    paintFootprints();
  }, [paintFootprints, selectedZoneId, zoneList]);

  const startDrawing = () => {
    const instance = map.current;
    if (!instance || !canEditZones) return;
    draw.current?.stop();
    const next = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: instance, prefixId: 'athar-zone-draw' }),
      modes: [new TerraDrawPolygonMode({ editable: true }), new TerraDrawSelectMode()]
    });
    next.start();
    next.setMode('polygon');
    draw.current = next;
    setSelectedZoneId(null);
    setZoneDraft({ name: 'Nouvelle zone', color: DEFAULT_ZONE_COLOR });
    setEditing('drawing');
    setMessage('Trace le contour, puis renseigne le nom et la couleur.');
  };

  const startBuildingPlacement = () => {
    if (!canCreateBuildings) return;
    if (!footprintContext.current.zone) {
      setMessage('Choisis une zone avant de poser un bâtiment.');
      return;
    }
    placingBuilding.current = true;
    setPlacing(true);
    setPickingFootprint(false);
    setPanelHeight('peek');
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = 'crosshair';
    // La consigne vit dans le bandeau : la ligne d'état ne la répète pas.
    setMessage('');
  };

  const cancelBuildingPlacement = () => {
    placingBuilding.current = false;
    setPlacing(false);
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = '';
    setMessage('Pose annulée. Rien n’a été créé.');
  };

  const startEditing = () => {
    const instance = map.current;
    const zone = zones.current.find((candidate) => candidate.id === selectedZoneId);
    if (!instance || !zone || !canEditZones) return;
    draw.current?.stop();
    const next = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: instance, prefixId: 'athar-zone-edit' }),
      modes: [new TerraDrawPolygonMode({ editable: true }), new TerraDrawSelectMode()]
    });
    next.start();
    const featureId = crypto.randomUUID();
    next.addFeatures([{ id: featureId, type: 'Feature', properties: { mode: 'polygon' }, geometry: { type: 'Polygon', coordinates: [zone.geometry.coordinates.map(([longitude, latitude]) => [longitude, latitude])] } }]);
    next.setMode('select');
    next.selectFeature(featureId);
    draw.current = next;
    setZoneDraft({ name: zone.name, color: zone.color });
    setEditing('editing');
    setMessage(`Édition de ${zone.name}. Ajuste le contour, le nom ou la couleur.`);
  };

  const saveZone = async () => {
    const draft = draw.current?.getSnapshot().map(geometryFromFeature).find((geometry): geometry is ZoneGeometry => geometry !== null);
    if (!draft) { setMessage('Trace un contour fermé avant d’enregistrer la zone.'); return; }
    const name = draftZoneName.trim();
    if (!name) { setMessage('Le nom de la zone est obligatoire.'); return; }
    const previous = editing === 'editing' ? zones.current.find((zone) => zone.id === selectedZoneId) : undefined;
    const id = previous?.id ?? `zone-${crypto.randomUUID()}`;
    const zone: Zone = {
      id, name, color: draftZoneColor,
      coverageState: previous?.coverageState ?? 'unassigned', assigneeLabel: previous?.assigneeLabel ?? null,
      geometry: draft, bbox: boundingBoxForPolygon(draft)
    };
    try {
      assertZone(zone);
      setSavingZone(true);
      await repositories.zones.save(zone);
      const buildings = await repositories.buildings.listByViewport(zone.bbox);
      const attachedCount = buildingsAttachedToZone(zone, buildings).length;
      selectZone(zone.id);
      draw.current?.stop();
      draw.current = null;
      setEditing(null);
      setMessage(`Zone enregistrée · ${attachedCount} bâtiment${attachedCount > 1 ? 's' : ''} dans son contour.`);
      await refreshViewport();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enregistrement de la zone impossible.');
    } finally {
      setSavingZone(false);
    }
  };

  const saveZoneProperties = async () => {
    if (!selectedZone || editing !== null) return;
    const zone = { ...selectedZone, name: draftZoneName.trim(), color: draftZoneColor };
    try {
      assertZone(zone);
      setSavingZone(true);
      await repositories.zones.save(zone);
      setMessage(`Zone « ${zone.name} » mise à jour.`);
      await refreshViewport();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modification de la zone impossible.');
    } finally {
      setSavingZone(false);
    }
  };

  const deleteSelectedZone = async (confirmed = false) => {
    if (!selectedZone || editing !== null) return;
    try {
      setSavingZone(true);
      const buildings = await repositories.buildings.listByZone(selectedZone.id);
      if (buildings.length > 0) {
        setMessage(`Suppression impossible : ${buildings.length > 1 ? `${buildings.length} bâtiments sont encore rattachés` : 'un bâtiment est encore rattaché'} à cette zone. Aucun bâtiment, aucune porte et aucun passage n’a été supprimé.`);
        return;
      }
      if (!confirmed) { setConfirmZoneDeletion(true); return; }
      setConfirmZoneDeletion(false);
      await repositories.zones.delete(selectedZone.id);
      selectZone(null);
      setMessage(`Zone « ${selectedZone.name} » supprimée. Aucun bâtiment, aucune porte et aucun passage n’a été supprimé.`);
      await refreshViewport();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Suppression de la zone impossible.');
    } finally {
      setSavingZone(false);
    }
  };

  // La liste terrain peut contenir des intentions locales. L'anneau utilise le même
  // relevé daté que le tableau administrateur ; il ne mesure pas les bâtiments détectés.
  const zoneBuildingCount = zoneBuildings.length;
  const selectedStats = zoneStats.get(selectedZoneId ?? '') ?? null;
  const progress = zoneDoorProgress(selectedStats, selectedZoneId ?? '');
  const todoCount = zoneBuildings.filter((entry) => matchesBuildingListFilter(entry, 'todo')).length;
  const staleCount = zoneBuildings.filter((entry) => entry.followUp.suggestedForRevisit).length;
  const openListedBuilding = (building: Building) => {
    lastBuilding.current = building.id;
    setMarkingOpen(false);
    flyToBuilding(building);
    onBuildingSelect?.(building, { persisted: true, suggestion: footprintSuggestions.current.get(building.id) ?? null });
  };
  const startMarking = () => {
    const centre = map.current?.getCenter();
    if (centre) setMarkingCentre({ latitude: centre.lat, longitude: centre.lng });
    const previous = candidates.find(entry => entry.building.id === lastBuilding.current);
    const single = candidates.length === 1 ? candidates[0] : null;
    if (previous || single) { openListedBuilding((previous ?? single)!.building); return; }
    setMarkingSearch('');
    setMarkingOpen(true);
  };
  const zoneName = selectedZone?.name ?? 'Zone à choisir';
  const coverageLabel = selectedStats && progress.percent !== null
    ? [zoneProgressSummary(progress), ...COVERAGE_SEGMENTS.filter((segment) => (selectedStats.countsByStatus[segment.id] ?? 0) > 0)
      .map((segment) => `${selectedStats.countsByStatus[segment.id]} ${STATUS_LABEL[segment.status]}`)].join(' · ')
    : zoneProgressSummary(progress);

  return (
    <section className="terrain-shell" data-mode={mode} data-panel={panelHeight} aria-label="Carte des zones et batiments">
      <h1 className="terrain-sr-only">Zones de Toulouse</h1>

      <div className="terrain-map-stage">
        {placing ? (
          <p className="hint" role="status">
            Touche la carte à l’emplacement exact du bâtiment
            <button onClick={cancelBuildingPlacement} type="button">Annuler</button>
          </p>
        ) : pickingFootprint && (
          <p className="hint" role="status">
            Touche l’emprise du bâtiment sur la carte
            <button onClick={() => setPickingFootprint(false)} type="button">Annuler</button>
          </p>
        )}
        <div aria-label="Carte MapLibre des zones" className={placing ? 'workspace-map placing' : 'workspace-map'} ref={element} />
      </div>

      <header className="terrain-topbar">
        <div className="terrain-brand" aria-label="Athar">
          <span className="terrain-wordmark-ar">أثر</span>
          <span className="terrain-wordmark-rule" />
          <span className="terrain-wordmark-la">Athar</span>
        </div>

        <div className="terrain-zone-picker" ref={zonePicker}>
          <button aria-expanded={zoneMenuOpen} aria-haspopup="menu" className="terrain-zonechip" onClick={() => setZoneMenuOpen((value) => !value)} title={zoneProgressDate(progress)} type="button">
            <span className="terrain-zone-ring" style={{ '--terrain-progress': `${progress.percent ?? 0}` } as CSSProperties}>
              <svg viewBox="0 0 36 36" aria-hidden="true">
                <circle className="terrain-zone-ring-track" cx="18" cy="18" r="15" />
                <circle className="terrain-zone-ring-value" cx="18" cy="18" r="15" pathLength="100" />
              </svg>
              <b data-testid="zone-recorded-progress">{progress.percent === null ? '—' : `${progress.percent}%`}</b>
            </span>
            <span className="terrain-zone-copy">
              <strong>{zoneName}</strong>
              <span>{zoneProgressSummary(progress)}</span>
            </span>
            <span className="terrain-zone-caret" aria-hidden="true">⌄</span>
          </button>
          {zoneMenuOpen && (
            <div aria-label="Choisir une zone" className="terrain-zone-menu" role="menu">
              {zoneList.length === 0
                ? <div className="terrain-zone-menu-empty"><p>{canEditZones ? 'Aucune zone trouvée. Si tu en as déjà tracé, le réseau a peut-être coupé la lecture. Sinon, passe en mode Édition pour en dessiner une.' : 'Aucune zone trouvée. Si le réseau est faible, réessaie ; sinon demande à ton coordinateur d’en tracer une.'}</p><button onClick={reloadZones} type="button">Recharger les zones</button></div>
                : zoneList.map((zone) => (
                  <button
                    aria-current={zone.id === selectedZoneId}
                    key={zone.id}
                    onClick={() => flyToZone(zone)}
                    role="menuitem"
                    type="button"
                  >
                    <i aria-hidden="true" style={{ background: zone.color }} />
                    <span>{zone.name}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="terrain-topbar-spacer" />

        {canEditZones && (
          <div className="terrain-modes" role="group" aria-label="Mode de la carte">
            <button aria-pressed={mode === 'terrain'} disabled={editing !== null || placing} onClick={() => switchMode('terrain')} type="button">Terrain</button>
            <button aria-pressed={mode === 'edition'} onClick={() => switchMode('edition')} type="button">Édition</button>
          </div>
        )}

        <button aria-label="Rechercher parmi les bâtiments suivis" className="terrain-mobile-action terrain-search-action" disabled={editing !== null || placing} onClick={() => {
          // La recherche est un geste de terrain : elle quitte l'Édition au lieu de s'y superposer.
          if (mode === 'edition') setMode('terrain');
          setZoneMenuOpen(false);
          setPanelHeight('full');
          window.setTimeout(() => searchInput.current?.focus(), 0);
        }} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
        </button>
        <button
          aria-label={canEditZones ? (mode === 'terrain' ? 'Passer en mode Édition' : 'Revenir en mode Terrain') : (panelHeight === 'full' ? 'Réduire la liste' : 'Afficher la liste complète')}
          className="terrain-mobile-action"
          disabled={canEditZones && (editing !== null || placing)}
          onClick={() => canEditZones ? switchMode(mode === 'terrain' ? 'edition' : 'terrain') : setPanelHeight((height) => height === 'full' ? 'peek' : 'full')}
          type="button"
        >
          {/* Un pictogramme par geste : le crayon change de mode, la liste déplie le panneau. */}
          {canEditZones
            ? (mode === 'terrain'
              ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>
              : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg>)
            : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 7h11M9 12h11M9 17h11M4 7h.01M4 12h.01M4 17h.01" /></svg>}
        </button>
        {account && (
          <AccountMenu
            displayName={account.displayName}
            links={account.links}
            onOpenSettings={account.onOpenSettings}
            onSignOut={account.onSignOut}
          />
        )}
      </header>

      {onBuildingSelect && (
        <section className="terrain-panel" aria-label="Batiments visibles">
          <button aria-expanded={panelHeight === 'full'} aria-label={panelHeight === 'full' ? 'Réduire le panneau' : 'Agrandir le panneau'} className="terrain-panel-grip" onClick={() => setPanelHeight((height) => height === 'full' ? 'peek' : 'full')} type="button"><i /></button>

          <div className="terrain-panel-head">
            <div className="terrain-field-tools">{syncNotice}{selectedZone && renderPreparation?.(selectedZone)}</div>
            {/* Activité reconstituée depuis les portes (lot B5) : ce n'est pas la durée d'une sortie. */}
            <div className="terrain-session-line">
              <span className="ds-microlabel">Aujourd’hui {terrainPage.partial ? 'sur cette page' : 'dans la zone'}</span>
              <span>{!listReady ? 'lecture en cours…' : session.markedCount === 0
                ? 'aucune porte marquée'
                : `${session.markedCount} porte${session.markedCount > 1 ? 's' : ''} marquée${session.markedCount > 1 ? 's' : ''}`}</span>
            </div>
            <TraceBar entries={listReady ? session.trace : []} />
            <label className="terrain-search">
              <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
              <span className="terrain-sr-only">Rechercher parmi les bâtiments suivis</span>
              <input ref={searchInput} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Adresse d’un bâtiment suivi" value={searchQuery} />
            </label>
          </div>

          <div className="terrain-panel-scroll" aria-busy={terrainPage.phase === 'loading'}>
            {terrainPage.partial && <p className="terrain-page-scope">La recherche et les filtres portent sur cette page. Les autres bâtiments sont sur les pages suivantes.</p>}
            <div className="building-list-controls">
              <div className="building-list-filters" role="group" aria-label="Filtrer les bâtiments">
                {BUILDING_LIST_FILTERS.map((filter) => (
                  <button disabled={!listReady} aria-pressed={listFilter === filter.id} className="building-list-filter" key={filter.id} onClick={() => setListFilter(filter.id)} type="button">
                    {filter.label}<b>{!listReady ? '—' : filter.id === 'all' ? zoneBuildingCount : filter.id === 'todo' ? todoCount : staleCount}</b>
                  </button>
                ))}
              </div>
              <label className="building-list-sort">Trier par
                <select aria-label="Trier les bâtiments" onChange={(event) => setListSort(event.target.value as BuildingListSort)} value={listSort}>
                  <option value="staleness">Ancienneté</option>
                  <option value="address">Adresse</option>
                </select>
              </label>
            </div>
            {!listReady ? <p className="building-list-empty" role="status">{terrainPage.phase === 'error' ? <>Liste indisponible. Vérifie le réseau ou la préparation hors ligne. <button type="button" onClick={terrainPage.retry}>Réessayer</button></> : !loadedZoneId && !metadataError ? 'Choisis une zone pour voir ses bâtiments.' : 'Chargement des bâtiments…'}</p> : listedBuildings.length === 0
              ? <p className="building-list-empty">{normalizedSearch ? <>Aucune adresse correspondante parmi les bâtiments chargés. <button type="button" onClick={() => { setSearchQuery(''); setListFilter('all'); }}>Effacer la recherche et les filtres</button></> : listFilter === 'stale' ? 'Aucun bâtiment ne correspond à ce filtre de revisite.' : listFilter === 'todo' ? 'Aucun bâtiment suivi ne correspond au filtre « Pas encore fait ».' : terrainPage.partial ? 'Aucun résultat sur cette page. Consulte la suivante ou change les filtres.' : 'Aucun bâtiment décrit dans cette zone. Touche une emprise pour commencer.'}</p>
              : <ul className="building-list-rows">
                {listedBuildings.map((entry) => {
                  const visual = buildingVisualStatus(listDoorGroups.get(entry.building.id) ?? []);
                  return <li key={entry.building.id}>
                    <button className="building-row" onClick={() => openListedBuilding(entry.building)} type="button">
                      <span aria-hidden="true" className={`terrain-building-pin terrain-building-pin--${visual}`} />
                      <span className="terrain-building-copy">
                        <span className="building-row-address">{entry.building.addressLabel}</span>
                        <span className="building-row-progress">{entry.doorCount === 0 ? 'Structure à décrire' : `${STATUS_LABEL[visual]} · ${entry.treatedCount}/${entry.doorCount} portes visitées`}</span>
                      </span>
                      <span className={entry.followUp.suggestedForRevisit ? 'building-row-age alert' : 'building-row-age'}>{buildingAgeLabel(entry)}</span>
                    </button>
                  </li>;
                })}
              </ul>}
            {canCreateBuildings && selectedZone && mode === 'terrain' && <button className="building-list-add" disabled={placing} onClick={startBuildingPlacement} type="button">+ Ajouter un bâtiment absent de la carte</button>}
            {(terrainPage.partial || terrainPage.index > 0) && <nav className="terrain-pagination" aria-label="Pages des bâtiments"><button disabled={terrainPage.index === 0 || terrainPage.phase === 'loading'} onClick={terrainPage.previous} type="button">Précédente</button><span>Page {terrainPage.index + 1}</span><button disabled={!terrainPage.nextCursor || terrainPage.phase !== 'ready'} onClick={terrainPage.next} type="button">Suivante</button></nav>}
            <span className="terrain-visible-count" data-visible-buildings={visibleBuildingCount}>
              {listReady ? `${zoneBuildingCount} bâtiment${zoneBuildingCount > 1 ? 's' : ''} suivi${zoneBuildingCount > 1 ? 's' : ''}${terrainPage.partial ? ' sur cette page' : ''}` : loadedZoneId ? 'Chargement de la liste…' : ''}{mapError && ' · carte indisponible'}
            </span>
            {/* Une seule mention de fraîcheur : le détail de provenance relève du pilotage. */}
            <p className="terrain-visible-count">{progress.updatedAt ? `Progression comptée le ${zoneProgressDate(progress).replace(/^Relevé du /, '')}, hors saisies en attente sur ce téléphone.` : 'Progression pas encore comptée.'}</p>
          </div>

          <footer className="terrain-panel-foot">
            <span className="ds-microlabel">Couverture de la zone · {zoneProgressSummary(progress)}</span>
            <span className="terrain-coverage" role="img" aria-label={coverageLabel}>
              {selectedStats && progress.percent !== null && selectedStats.doorCount > 0 && COVERAGE_SEGMENTS.map((segment) => {
                const count = selectedStats.countsByStatus[segment.id] ?? 0;
                return count > 0 && <i key={segment.id} style={{ width: `${(count / selectedStats.doorCount) * 100}%`, background: `var(--st-${segment.status})` }} />;
              })}
            </span>
          </footer>
        </section>
      )}

      <aside className="terrain-legend" aria-label="Légende des statuts">
        <span className="ds-microlabel">Statut des bâtiments</span>
        <span><i className="terrain-building-pin terrain-building-pin--open" />Contact établi</span>
        <span><i className="terrain-building-pin terrain-building-pin--away" />Absent</span>
        <span><i className="terrain-building-pin terrain-building-pin--linked" />Attaché à l’effort</span>
        <span><i className="terrain-building-pin terrain-building-pin--dnd" />Ne pas déranger</span>
        <span><i className="terrain-building-pin terrain-building-pin--locked" />Accès bloqué</span>
        <span><i className="terrain-building-pin terrain-building-pin--todo" />Pas encore fait</span>
        <span className="terrain-legend-sisters"><i />À confier aux sœurs</span>
      </aside>

      {mode === 'edition' && (
        <div className="terrain-editbar" aria-label="Outils de zone">
          <span className="terrain-editbar-mode">Mode Édition</span>
          <select aria-label="Zone a modifier" value={selectedZoneId ?? ''} onChange={(event) => selectZone(event.target.value || null)}>
            {!selectedZoneId && <option value="">Choisir une zone</option>}
            {zoneList.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
          </select>
          {canEditZones && <button disabled={editing !== null || savingZone} onClick={startDrawing} type="button">Créer une zone</button>}
          {canEditZones && <button disabled={editing !== null || !selectedZoneId} onClick={startEditing} type="button">Redessiner</button>}
          {canCreateBuildings && <button disabled={editing !== null || placing} onClick={startBuildingPlacement} type="button">Ajouter un bâtiment</button>}
          {canEditZones && selectedZone && <button className="terrain-editbar-danger" disabled={editing !== null || savingZone} onClick={() => void deleteSelectedZone()} type="button">Supprimer</button>}
          {editing && <button className="terrain-editbar-save" disabled={savingZone} onClick={() => void saveZone()} type="button">Enregistrer la zone</button>}
        </div>
      )}

      {mode === 'edition' && canEditZones && !placing && !zoneMenuOpen && (selectedZone || editing) && (
        <div className="terrain-zone-properties" aria-label="Proprietes de la zone">
          <label>Nom de la zone<input aria-label="Nom de la zone" maxLength={80} onChange={(event) => setZoneDraft({ name: event.target.value, color: draftZoneColor })} value={draftZoneName} /></label>
          <label>Couleur<input aria-label="Couleur de la zone" onChange={(event) => setZoneDraft({ name: draftZoneName, color: event.target.value })} type="color" value={draftZoneColor} /></label>
          {!editing && <button disabled={savingZone} onClick={() => void saveZoneProperties()} type="button">Enregistrer les propriétés</button>}
        </div>
      )}

      <div className="terrain-fabs">
        <button aria-label={locating ? 'Recherche de position en cours' : 'Ma position'} disabled={locating} className="terrain-fab terrain-fab-ghost" onClick={() => void locate()} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" /><circle cx="12" cy="12" r="8" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3" /></svg>
        </button>
        <button aria-disabled={!selectedZone || !listReady} className="terrain-fab terrain-fab-primary" disabled={!onBuildingSelect} onClick={() => {
          // Un bouton grisé ne dit pas pourquoi : l'appui l'explique et oriente vers la suite.
          if (!selectedZone) { setMessage('Choisis d’abord une zone dans le menu en haut.'); setZoneMenuOpen(true); return; }
          if (!listReady) { setMessage(terrainPage.phase === 'error' ? 'Liste indisponible : touche « Réessayer » dans le panneau.' : 'Les bâtiments de la zone se chargent, réessaie dans un instant.'); return; }
          startMarking();
        }} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          Marquer une porte
        </button>
      </div>

      <Dialog open={markingOpen} title="Choisir un bâtiment pour marquer une porte" onClose={() => setMarkingOpen(false)}>
        <p>Bâtiments {terrainPage.partial ? 'de la page chargée' : 'suivis'} autour du centre de la carte. Choisis celui devant lequel tu te trouves.</p>
        <label className="terrain-search"><span className="terrain-sr-only">Adresse du bâtiment à marquer</span><input placeholder="Adresse d’un bâtiment suivi" value={markingSearch} onChange={event => setMarkingSearch(event.target.value)} /></label>
        <ul className="marking-candidates">{candidates.filter(entry => matchesAddress(entry.building.addressLabel, markingSearch)).map(entry => <li key={entry.building.id}><button type="button" onClick={() => openListedBuilding(entry.building)}>{entry.building.addressLabel}<small>{entry.doorCount} portes décrites</small></button></li>)}</ul>
        {candidates.filter(entry => matchesAddress(entry.building.addressLabel, markingSearch)).length === 0 && <p>Aucun bâtiment suivi disponible pour ce choix. Les portes sorties du suivi ne sont pas proposées.</p>}
        <button className="ds-button ds-button--brand" type="button" onClick={() => { setMarkingOpen(false); setPanelHeight('peek'); setMessage(''); setPickingFootprint(true); }}>Choisir une emprise sur la carte</button>
        <button className="ds-button ds-button--ghost" type="button" onClick={() => setMarkingOpen(false)}>Annuler</button>
      </Dialog>
      <Dialog open={confirmZoneDeletion && selectedZone !== null} title="Supprimer cette zone ?" onClose={() => setConfirmZoneDeletion(false)}><p>Supprimer « {selectedZone?.name} » ? Aucun bâtiment, aucune porte et aucun passage ne sera supprimé.</p><button className="ds-button ds-button--brand" disabled={savingZone} onClick={() => void deleteSelectedZone(true)} type="button">Supprimer la zone</button><button className="ds-button ds-button--ghost" onClick={() => setConfirmZoneDeletion(false)} type="button">Annuler</button></Dialog>
      {(mapError || metadataError || viewportPartial) && <aside className="terrain-read-alert" aria-label="État de la carte"><p>{mapError ? 'Carte indisponible. La liste reste utilisable.' : metadataError ? 'Zones indisponibles. Vérifie le réseau ou la préparation hors ligne.' : 'Données du cadrage incomplètes. Les pointillés indiquent les bâtiments à vérifier. Rapproche la carte ou vérifie la préparation hors ligne.'}</p><button type="button" onClick={() => { if (mapError) setMapVersion(value => value + 1); else { metadata.current = null; void ensureMetadata().then(() => refreshViewport()).catch(() => undefined); } }}>Réessayer la carte</button></aside>}
      <p className="terrain-status" role="status">{message}</p>
    </section>
  );
}
