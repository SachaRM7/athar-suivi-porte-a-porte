import { Map as MapLibreMap, NavigationControl, addProtocol, type GeoJSONFeature, type GeoJSONSource, type Map as MapInstance } from 'maplibre-gl';
import { PMTiles, Protocol, type Source } from 'pmtiles';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { geohashForLocation } from 'geofire-common';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { withBasePath } from '../../../app/config/public-paths';
import type { Building, GeoPoint, Status, Zone, ZoneGeometry } from '../../../domain/workspace/models';
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
  squareAround,
  zoneProgressLabel,
  type FootprintContext,
} from '../model/footprints';
import 'maplibre-gl/dist/maplibre-gl.css';

class LocalPackageSource implements Source {
  private readonly archive: Promise<ArrayBuffer>;

  constructor(url: string) {
    this.archive = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Offline PMTiles package unavailable: ${response.status}`);
      return response.arrayBuffer();
    });
  }

  getKey(): string { return 'athar-toulouse-local'; }

  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
    const archive = await this.archive;
    return { data: archive.slice(offset, offset + length) };
  }
}

const protocol = new Protocol();
const archive = new PMTiles(new LocalPackageSource(withBasePath('/fixtures/toulouse.pmtiles')));
protocol.add(archive);
addProtocol('pmtiles', protocol.tile);
// Glyphs are bundled locally so street labels remain available after PWA preparation.
const DEFAULT_ZONE_COLOR = '#16835F';

/**
 * Tuileset d'emprises du lot WP6. Il pèse 72 Mo et vit hors de Git ; l'échantillon versionné
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
  canEditZones: boolean;
  canCreateBuildings?: boolean;
  /** Archives PMTiles essayées dans l'ordre ; la première disponible fournit les emprises. */
  footprintArchives?: readonly string[];
  onBuildingSelect?: (building: Building, options: { persisted: boolean }) => void;
  onBuildingLocationSelect?: (location: GeoPoint) => void;
};

async function firstAvailableArchive(urls: readonly string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { Range: 'bytes=0-15' } });
      if (response.ok || response.status === 206) return url;
    } catch {
      // Archive suivante : l'absence du tuileset n'est pas une erreur de carte.
    }
  }
  return null;
}

function zoneFeatures(zones: readonly Zone[], progressLabels: ReadonlyMap<string, string>): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((zone) => ({
      type: 'Feature' as const,
      properties: { id: zone.id, name: zone.name, progressLabel: progressLabels.get(zone.id) ?? zone.name },
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

export function WorkspaceMap({ repositories, authorId, canEditZones, canCreateBuildings = false, footprintArchives = DEFAULT_FOOTPRINT_ARCHIVES, onBuildingSelect, onBuildingLocationSelect }: WorkspaceMapProps): ReactElement {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const viewportRequest = useRef<AbortController | null>(null);
  const placingBuilding = useRef(false);
  const zones = useRef<readonly Zone[]>([]);
  const selectedZoneRef = useRef<string | null>(null);
  const footprintContext = useRef<FootprintContext>({ zone: null, buildings: new Map(), doorsByBuilding: new Map(), statuses: new Map(), untouchedColor: UNTOUCHED_COLOR });
  const [zoneList, setZoneList] = useState<readonly Zone[]>([]);
  const [visibleBuildings, setVisibleBuildings] = useState<readonly Building[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [visibleBuildingCount, setVisibleBuildingCount] = useState(0);
  const [attachedBuildingCount, setAttachedBuildingCount] = useState<number | null>(null);
  const [editing, setEditing] = useState<'drawing' | 'editing' | null>(null);
  const [placing, setPlacing] = useState(false);
  /**
   * `null` signifie « pas encore touché » : les champs reflètent alors la zone sélectionnée.
   * Les brouillons sont dérivés au rendu plutôt que recopiés par un effet, sinon chaque
   * changement de sélection déclencherait un rendu en cascade.
   */
  const [zoneDraft, setZoneDraft] = useState<{ name: string; color: string } | null>(null);
  const [savingZone, setSavingZone] = useState(false);
  const [message, setMessage] = useState('Fond Toulouse local pret.');

  const selectedZone = zoneList.find((zone) => zone.id === selectedZoneId) ?? null;
  const draftZoneName = zoneDraft?.name ?? selectedZone?.name ?? '';
  const draftZoneColor = zoneDraft?.color ?? selectedZone?.color ?? DEFAULT_ZONE_COLOR;

  const selectZone = (zoneId: string | null) => {
    setSelectedZoneId(zoneId);
    setZoneDraft(null);
  };

  useEffect(() => { selectedZoneRef.current = selectedZoneId; }, [selectedZoneId]);

  /**
   * Alimente `feature-state` depuis Firestore. Une emprise sans document reste grise :
   * aucune écriture n'est déclenchée ici, ni au survol, ni à l'appui.
   */
  const paintFootprints = useCallback(() => {
    const instance = map.current;
    if (!instance) return;
    const context = footprintContext.current;
    const tiled = new Set<string>();
    try {
      if (instance.getSource(FOOTPRINT_SOURCE)) {
        for (const feature of instance.querySourceFeatures(FOOTPRINT_SOURCE, { sourceLayer: FOOTPRINT_SOURCE_LAYER })) {
          const rnbId = feature.properties?.rnb_id;
          if (typeof rnbId !== 'string' || tiled.has(rnbId)) continue;
          const ring = outerRing(feature);
          if (!ring) continue;
          tiled.add(rnbId);
          instance.setFeatureState(
            { source: FOOTPRINT_SOURCE, sourceLayer: FOOTPRINT_SOURCE_LAYER, id: rnbId },
            footprintState(rnbId, centerOfRing(ring), context)
          );
        }
      }
    } catch {
      // Tuiles pas encore chargées : le prochain « sourcedata » repassera.
    }
    const untiled = [...context.buildings.values()].filter((building) => !tiled.has(building.id));
    (instance.getSource(LOCAL_BUILDING_SOURCE) as GeoJSONSource | undefined)?.setData(localBuildingFeatures(untiled, context));
    element.current?.setAttribute('data-footprints', String(tiled.size));
  }, []);

  const refreshViewport = useCallback(async () => {
    const instance = map.current;
    if (!instance) return;
    viewportRequest.current?.abort();
    const controller = new AbortController();
    viewportRequest.current = controller;
    const bounds = instance.getBounds();
    const viewport = { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() };
    element.current?.setAttribute('data-viewport', JSON.stringify(viewport));
    const [nextZones, buildings, doors, statuses] = await Promise.all([
      repositories.zones.list(),
      repositories.buildings.listByViewport(viewport, { signal: controller.signal }),
      repositories.doors.listByViewport(viewport, { signal: controller.signal }),
      repositories.statuses.list()
    ]);
    if (controller.signal.aborted || viewportRequest.current !== controller) return;
    const stats = await Promise.all(nextZones.map(async (zone) => [zone.id, zoneProgressLabel(zone, await repositories.zones.getStats(zone.id))] as const));
    if (viewportRequest.current !== controller) return;
    zones.current = nextZones;
    setZoneList(nextZones);
    const activeZoneId = selectedZoneRef.current ?? nextZones[0]?.id ?? null;
    footprintContext.current = {
      zone: nextZones.find((zone) => zone.id === activeZoneId) ?? null,
      buildings: new Map(buildings.map((building) => [building.id, building])),
      doorsByBuilding: groupDoorsByBuilding(doors),
      statuses: new Map<string, Status>(statuses.map((status) => [status.id, status])),
      untouchedColor: UNTOUCHED_COLOR
    };
    (instance.getSource(ZONE_SOURCE) as GeoJSONSource | undefined)?.setData(zoneFeatures(nextZones, new Map(stats)));
    setVisibleBuildingCount(buildings.length);
    setVisibleBuildings(buildings);
    setSelectedZoneId((current) => current ?? nextZones[0]?.id ?? null);
    paintFootprints();
  }, [paintFootprints, repositories]);

  /**
   * Un appui sur une emprise ouvre la vue bâtiment, jamais un formulaire de création :
   * l'emprise existe déjà. Sans document Firestore, la fiche s'ouvre sur l'état vide et
   * le bâtiment n'est matérialisé qu'au moment où quelqu'un décrit sa structure.
   */
  const openFootprint = useCallback(async (feature: GeoJSONFeature) => {
    const identifier = feature.properties?.rnb_id ?? feature.properties?.id;
    if (typeof identifier !== 'string') return;
    const existing = await repositories.buildings.get(identifier);
    if (existing) {
      onBuildingSelect?.(existing, { persisted: true });
      return;
    }
    const zone = footprintContext.current.zone;
    const ring = outerRing(feature);
    if (!zone || !ring) return;
    const [longitude, latitude] = centerOfRing(ring);
    onBuildingSelect?.({
      id: identifier,
      // HYPOTHÈSE: le tuileset ne porte aucune adresse — `03-CARTO.md` écarte le géocodage.
      // L'ID-RNB tient lieu d'étiquette tant que personne n'a saisi l'adresse.
      addressLabel: `Bâtiment ${identifier}`,
      location: { latitude, longitude },
      geohash: geohashForLocation([latitude, longitude]),
      zoneId: zone.id,
      createdBy: authorId,
      structureRevision: 0
    }, { persisted: false });
  }, [authorId, onBuildingSelect, repositories.buildings]);

  useEffect(() => {
    if (!element.current || map.current) return;
    const instance = new MapLibreMap({
      container: element.current,
      // Zoom 16 minimum : en dessous, `03-CARTO.md` n'affiche plus les emprises individuelles.
      center: [1.4468, 43.6064], zoom: 16.1, pitch: 0, bearing: 0,
      attributionControl: { compact: true },
      style: localMapStyle
    });
    map.current = instance;
    element.current.dataset.basemap = 'local-pmtiles';
    instance.on('error', (event) => console.error('Workspace map error', event.error));
    const initializeWorkspaceLayers = async () => {
      if (instance.getSource(ZONE_SOURCE)) return;
      {
        const header = await archive.getHeader();
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

      const footprintArchiveUrl = await firstAvailableArchive(footprintArchives.map((path) => withBasePath(path as `/${string}`)));
      if (footprintArchiveUrl) {
        const footprints = new PMTiles(footprintArchiveUrl);
        protocol.add(footprints);
        const header = await footprints.getHeader();
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
        setMessage('Emprises indisponibles : generez public/tiles/batiments-31.pmtiles (voir scripts/carto/README.md).');
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
          onBuildingLocationSelect?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
          setMessage('Emplacement choisi. Completez la fiche du batiment.');
          return;
        }
        const layers = CLICKABLE_FOOTPRINT_LAYERS.filter((layerId) => instance.getLayer(layerId));
        const hit = instance.queryRenderedFeatures(event.point, { layers })
          // Les emprises hors zone sont inertes : elles partagent la source mais pas l'appui.
          .find((feature) => feature.source === LOCAL_BUILDING_SOURCE || feature.state?.inZone === true);
        // Appui dans le vide : aucune création, aucune écriture.
        if (!hit) return;
        void openFootprint(hit);
      });

      instance.on('idle', paintFootprints);
      instance.on('sourcedata', (event) => { if (event.sourceId === FOOTPRINT_SOURCE && event.isSourceLoaded) paintFootprints(); });
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      setMessage((current) => current.startsWith('Emprises indisponibles') ? current : 'Fond Toulouse local pret.');
      void refreshViewport().catch((error) => { if (!(error instanceof Error) || error.name !== 'ReadAbortedError') setMessage(error instanceof Error ? error.message : 'Lecture de carte indisponible.'); });
    };
    const initializeAfterStyleLoad = () => {
      void initializeWorkspaceLayers().catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Carte indisponible.');
      });
    };
    if (instance.isStyleLoaded()) initializeAfterStyleLoad();
    else instance.once('style.load', initializeAfterStyleLoad);
    instance.on('moveend', () => { void refreshViewport().catch((error) => { if (!(error instanceof Error) || error.name !== 'ReadAbortedError') setMessage(error instanceof Error ? error.message : 'Lecture de carte indisponible.'); }); });
    return () => { viewportRequest.current?.abort(); draw.current?.stop(); draw.current = null; map.current?.remove(); map.current = null; };
  }, [footprintArchives, onBuildingLocationSelect, openFootprint, paintFootprints, refreshViewport]);

  /** Couche 7 de `03-CARTO.md` : la position réelle, seul autre usage du safran. */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition((position) => {
      const data: FeatureCollection<Point> = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [position.coords.longitude, position.coords.latitude] } }]
      };
      (map.current?.getSource(POSITION_SOURCE) as GeoJSONSource | undefined)?.setData(data);
    }, undefined, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
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
    setAttachedBuildingCount(null);
    setMessage('Tracez le contour, puis renseignez le nom et la couleur.');
  };

  const startBuildingPlacement = () => {
    if (!canCreateBuildings) return;
    placingBuilding.current = true;
    setPlacing(true);
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = 'crosshair';
    setMessage('Touchez la carte a l emplacement exact du batiment.');
  };

  const cancelBuildingPlacement = () => {
    placingBuilding.current = false;
    setPlacing(false);
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = '';
    setMessage('Pose annulee. Rien n a ete cree.');
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
    setAttachedBuildingCount(null);
    setMessage(`Edition de ${zone.name}. Ajustez le contour, le nom ou la couleur.`);
  };

  const saveZone = async () => {
    const draft = draw.current?.getSnapshot().map(geometryFromFeature).find((geometry): geometry is ZoneGeometry => geometry !== null);
    if (!draft) { setMessage('Aucun polygone valide a enregistrer.'); return; }
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
      setAttachedBuildingCount(attachedCount);
      selectZone(zone.id);
      draw.current?.stop();
      draw.current = null;
      setEditing(null);
      setMessage(`Zone enregistree. ${attachedCount} batiment(s) rattache(s) par point-dans-polygone.`);
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
      setMessage(`Zone « ${zone.name} » mise a jour.`);
      await refreshViewport();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modification de la zone impossible.');
    } finally {
      setSavingZone(false);
    }
  };

  const deleteSelectedZone = async () => {
    if (!selectedZone || editing !== null) return;
    if (!window.confirm(`Supprimer la zone « ${selectedZone.name} » ?`)) return;
    try {
      setSavingZone(true);
      const buildings = await repositories.buildings.listByZone(selectedZone.id);
      if (buildings.length > 0) {
        setMessage(`Suppression impossible : ${buildings.length} batiment(s) sont encore rattache(s) a cette zone.`);
        return;
      }
      await repositories.zones.delete(selectedZone.id);
      selectZone(null);
      setAttachedBuildingCount(null);
      setMessage(`Zone « ${selectedZone.name} » supprimee.`);
      await refreshViewport();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Suppression de la zone impossible.');
    } finally {
      setSavingZone(false);
    }
  };

  return (
    <section className="workspace-map-shell" aria-label="Carte des zones et batiments">
      <header className="workspace-map-header">
        <div><p className="eyebrow">Athar / carte locale</p><h1>Zones de Toulouse</h1></div>
        <div className="workspace-map-metrics"><span>{visibleBuildingCount} batiment(s) visibles</span>{attachedBuildingCount !== null && <span>{attachedBuildingCount} rattache(s)</span>}</div>
      </header>
      <div className="workspace-map-tools" aria-label="Outils de zone">
        <select aria-label="Zone a modifier" value={selectedZoneId ?? ''} onChange={(event) => selectZone(event.target.value || null)}>
          {!selectedZoneId && <option value="">Choisir une zone</option>}
          {zoneList.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select>
        {canEditZones && <button className="secondary-action map-tool" disabled={editing !== null || savingZone} onClick={startDrawing} type="button">Créer une zone</button>}
        {canEditZones && <button className="secondary-action map-tool" disabled={editing !== null || !selectedZoneId} onClick={startEditing} type="button">Modifier la zone</button>}
        {canEditZones && selectedZone && <button className="secondary-action map-tool danger-action" disabled={editing !== null || savingZone} onClick={() => void deleteSelectedZone()} type="button">Supprimer la zone</button>}
        {canCreateBuildings && <button className="secondary-action map-tool" disabled={editing !== null || placing} onClick={startBuildingPlacement} type="button">Ajouter un bâtiment</button>}
        {editing && <button className="primary-action map-tool" disabled={savingZone} onClick={() => void saveZone()} type="button">Enregistrer la zone</button>}
        <button aria-label="Cadrer sur les emprises" className="secondary-action map-tool" onClick={() => map.current?.easeTo({ zoom: FOOTPRINT_MIN_ZOOM + 0.4, duration: 450 })} type="button">Voir les emprises</button>
      </div>
      {canEditZones && (selectedZone || editing) && (
        <div className="zone-properties" aria-label="Proprietes de la zone">
          <label>Nom de la zone<input aria-label="Nom de la zone" maxLength={80} onChange={(event) => setZoneDraft({ name: event.target.value, color: draftZoneColor })} value={draftZoneName} /></label>
          <label className="zone-color-field">Couleur<input aria-label="Couleur de la zone" onChange={(event) => setZoneDraft({ name: draftZoneName, color: event.target.value })} type="color" value={draftZoneColor} /></label>
          {!editing && <button className="secondary-action map-tool" disabled={savingZone} onClick={() => void saveZoneProperties()} type="button">Enregistrer les propriétés</button>}
        </div>
      )}
      {onBuildingSelect && (
        <div className="visible-building-list" aria-label="Batiments visibles">
          {visibleBuildings.map((building) => (
            <button className="building-chip" key={building.id} onClick={() => onBuildingSelect(building, { persisted: true })} type="button">
              {building.addressLabel}
            </button>
          ))}
        </div>
      )}
      <div className="workspace-map-stage">
        {placing && (
          <p className="hint" role="status">
            Touche la carte à l’emplacement exact du bâtiment
            <button onClick={cancelBuildingPlacement} type="button">Annuler</button>
          </p>
        )}
        <div aria-label="Carte MapLibre des zones" className={placing ? 'workspace-map placing' : 'workspace-map'} ref={element} />
      </div>
      <p className="workspace-map-message" role="status">{message}</p>
    </section>
  );
}
