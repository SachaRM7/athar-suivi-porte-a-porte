import L from 'leaflet';
import { leafletLayer, paintRules, labelRules } from 'protomaps-leaflet';
import { namedFlavor } from '@protomaps/basemaps';
import { PMTiles, SharedPromiseCache, type Header, type Source } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import type { Feature, Geometry } from 'geojson';
import { withBasePath } from '../../../app/config/public-paths';
import type { Building, Zone } from '../../../domain/workspace/models';
import { readTask, mapLimited } from '../../../shared/async/read-task';
import { firstAvailableArchive } from '../model/footprint-archive';
import { canvasTiles } from '../model/canvas-tiles';
import { centerOfRing, footprintState, isInsideZone, squareAround, type FootprintContext } from '../model/footprints';
import type { PositionFix } from '../model/follow-position';
import { FOOTPRINT_MIN_ZOOM } from '../config/athar-layers';
import { ATHAR_LIGHT_MAP_PALETTE as palette } from '../config/map-style';
import { footprintBuildingLabel } from '../../buildings/model/building-address';
import { LocalPmtilesSource } from './local-pmtiles-source';
import 'leaflet/dist/leaflet.css';
import './canvas-map.css';

export type MapFootprint = Feature<Geometry>;
export type MapCamera = { center: [number, number]; zoom: number };

type Options = {
  camera: MapCamera;
  footprintArchives: readonly string[];
  onMove(): void;
  onDrag(): void;
  onClick(longitude: number, latitude: number, footprint?: MapFootprint): void;
  onError(message: string): void;
  onFootprints(features: readonly MapFootprint[]): void;
};

/** Canvas basemap + SVG footprints. No WebGL context and no external tile service. */
export class CanvasMap {
  private readonly instance: L.Map;
  private readonly lifetime = new AbortController();
  private readonly zoneLayer = L.layerGroup();
  private readonly buildingLayer = L.layerGroup();
  private readonly positionLayer = L.layerGroup();
  private readonly resize: ResizeObserver;
  private footprintArchive: PMTiles | null = null;
  private footprintHeader: Header | null = null;
  private footprintRequest: AbortController | null = null;
  private features: readonly MapFootprint[] = [];
  private context: FootprintContext | null = null;
  private pending: readonly Building[] = [];
  private moveTimer: ReturnType<typeof setTimeout> | undefined;
  readonly ready: Promise<void>;

  constructor(private readonly container: HTMLDivElement, private readonly options: Options) {
    // The Leaflet frontend of protomaps-leaflet expects Leaflet's browser global.
    (window as Window & { L?: typeof L }).L = L;
    this.instance = L.map(container, {
      center: [options.camera.center[1], options.camera.center[0]],
      // Leaflet's world uses 256px tiles, MapLibre's uses 512px tiles.
      zoom: options.camera.zoom + 1, minZoom: 9, maxZoom: 21,
      zoomSnap: 0.1, zoomControl: false, attributionControl: true,
      zoomAnimation: false, fadeAnimation: false
    });
    L.control.zoom({ position: 'topright', zoomInTitle: 'Zoom avant', zoomOutTitle: 'Zoom arrière' }).addTo(this.instance);
    this.instance.attributionControl.setPrefix(false);
    this.zoneLayer.addTo(this.instance);
    this.buildingLayer.addTo(this.instance);
    this.positionLayer.addTo(this.instance);
    this.instance.on('click', (event: L.LeafletMouseEvent) => options.onClick(event.latlng.lng, event.latlng.lat));
    this.instance.on('dragstart', options.onDrag);
    this.instance.on('moveend', () => {
      this.footprintRequest?.abort();
      clearTimeout(this.moveTimer);
      options.onMove();
      this.moveTimer = setTimeout(() => { void this.loadFootprints(); }, 180);
    });
    this.resize = new ResizeObserver(() => this.instance.invalidateSize({ pan: false }));
    this.resize.observe(container);
    container.dataset.basemap = 'local-pmtiles-canvas';
    this.ready = this.initialize();
  }

  private archive(url: string, basemap = false): PMTiles {
    const source = new LocalPmtilesSource(url);
    const bounded: Source = {
      getKey: () => source.getKey(),
      getBytes: async (offset, length, signal) => {
        // Applies to header reads as well as tile reads; closing the map cancels all I/O.
        const combined = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]);
        try { return await source.getBytes(offset, length, combined); }
        catch (error) {
          if (basemap && !this.lifetime.signal.aborted && !signal?.aborted) {
            this.options.onError('Fond de carte indisponible. Vérifie la connexion ou la préparation hors ligne puis réessaie.');
          }
          throw error;
        }
      }
    };
    return new PMTiles(bounded, new SharedPromiseCache(64));
  }

  private async initialize(): Promise<void> {
    const archive = this.archive(withBasePath('/fixtures/toulouse.pmtiles'), true);
    // A missing basemap must not block footprints, saved buildings or their sheets.
    const basemap = (async () => {
      const header = await readTask(archive.getHeader(), this.lifetime.signal);
      if (this.lifetime.signal.aborted) return;
      const flavor = { ...namedFlavor('light'), background: palette.fond, earth: palette.fond,
        water: palette.map.water, buildings: palette.map.buildings, park_a: palette.map.green, park_b: palette.map.green };
      const layer = leafletLayer({
        // Both PMTiles versions expose the same getZxy API; keep our bounded v4 Source.
        url: archive as unknown as NonNullable<Parameters<typeof leafletLayer>[0]>['url'],
        maxDataZoom: header.maxZoom, noWrap: true,
        bounds: [[header.minLat, header.minLon], [header.maxLat, header.maxLon]],
        paintRules: paintRules(flavor), labelRules: labelRules(flavor, 'fr'),
        backgroundColor: palette.fond
      }) as unknown as L.GridLayer;
      layer.on('tileload', () => { this.container.dataset.basemapReady = 'true'; });
      layer.addTo(this.instance);
    })().catch(() => {
      if (!this.lifetime.signal.aborted) this.options.onError('Fond de carte indisponible. Vérifie la connexion ou la préparation hors ligne puis réessaie.');
    });
    const footprints = (async () => {
      const url = await firstAvailableArchive(this.options.footprintArchives.map(path => withBasePath(path as `/${string}`)), undefined, this.lifetime.signal);
      if (this.lifetime.signal.aborted) return;
      if (!url) {
        this.options.onError('Emprises indisponibles. Les bâtiments déjà suivis restent accessibles.');
        return;
      }
      this.footprintArchive = this.archive(url);
      this.footprintHeader = await readTask(this.footprintArchive.getHeader(), this.lifetime.signal);
      await this.loadFootprints();
    })().catch(() => {
      if (!this.lifetime.signal.aborted) this.options.onError('Emprises indisponibles. Les bâtiments déjà suivis restent accessibles.');
    });
    await Promise.all([basemap, footprints]);
  }

  private async loadFootprints(): Promise<void> {
    if (this.lifetime.signal.aborted) return;
    this.footprintRequest?.abort();
    this.features = [];
    this.options.onFootprints([]);
    this.paintBuildings();
    if (this.getZoom() < FOOTPRINT_MIN_ZOOM || !this.footprintArchive || !this.footprintHeader) return;
    const request = new AbortController();
    this.footprintRequest = request;
    const signal = AbortSignal.any([request.signal, this.lifetime.signal]);
    const bounds = this.getBounds();
    const header = this.footprintHeader;
    const visible = { west: Math.max(bounds.getWest(), header.minLon), east: Math.min(bounds.getEast(), header.maxLon),
      south: Math.max(bounds.getSouth(), header.minLat), north: Math.min(bounds.getNorth(), header.maxLat) };
    if (visible.west > visible.east || visible.south > visible.north) return;
    try {
      const tiles = canvasTiles(visible, Math.min(header.maxZoom, Math.max(header.minZoom, Math.floor(this.getZoom()))));
      let featureCount = 0;
      const features = await mapLimited(tiles, 4, signal, async tile => {
        const result = await readTask(this.footprintArchive!.getZxy(tile.z, tile.x, tile.y, signal), signal);
        if (!result) return [];
        const layer = new VectorTile(new Pbf(new Uint8Array(result.data))).layers.batiments;
        const decoded: MapFootprint[] = [];
        if (!layer) return decoded;
        for (let index = 0; index < layer.length; index++) {
          if (++featureCount > 15_000) throw new Error('Rapproche la carte pour afficher les bâtiments.');
          const feature = layer.feature(index).toGeoJSON(tile.x, tile.y, tile.z);
          if (typeof feature.properties?.rnb_id === 'string') decoded.push(feature);
        }
        return decoded;
      });
      if (signal.aborted) return;
      this.features = features.flat();
      this.options.onFootprints(this.features);
      this.paintBuildings();
    } catch (error) {
      if (!signal.aborted) this.options.onError(error instanceof Error ? error.message : 'Emprises indisponibles. Réessaie ou utilise la liste.');
    }
  }

  setContext(context: FootprintContext, pending: readonly Building[]): void {
    this.context = context;
    this.pending = pending;
    this.paintBuildings();
  }

  private paintBuildings(): void {
    this.buildingLayer.clearLayers();
    if (!this.context || this.getZoom() < FOOTPRINT_MIN_ZOOM) return;
    const context = this.context;
    const tiled = new Set(this.features.map(feature => feature.properties?.rnb_id as string));
    const buildings = new Map(context.buildings);
    for (const building of this.pending) buildings.set(building.id, building);
    const local: MapFootprint[] = [...buildings.values()].filter(building => !tiled.has(building.id)).map(building => ({
      type: 'Feature', properties: { id: building.id, label: building.addressLabel },
      geometry: { type: 'Polygon', coordinates: [squareAround(building.location.longitude, building.location.latitude)] }
    }));
    for (const feature of [...this.features, ...local]) {
      const ring = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0]
        : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates[0]?.[0] : null;
      if (!ring?.length) continue;
      const id = (feature.properties?.rnb_id ?? feature.properties?.id) as string;
      const state = footprintState(id, centerOfRing(ring.map(([lng, lat]) => [lng, lat])), context);
      const color = !state.inZone ? palette.map.buildings : state.known ? state.color : palette.text2;
      const shape = L.geoJSON(feature, { interactive: state.inZone, bubblingMouseEvents: false,
        style: { color, weight: state.inZone ? 1.3 : 0, fillColor: state.inZone && !state.known ? palette.surface1 : color,
          fillOpacity: state.inZone && (!state.known || state.tracked) ? 0.55 : 1,
          dashArray: state.inZone && !state.known ? '3 3' : undefined }
      }).addTo(this.buildingLayer);
      if (state.inZone && state.sisters) {
        L.geoJSON(feature, { interactive: false, style: { color: '#C25B7C', weight: 4, fill: false, opacity: 0.8 } }).addTo(this.buildingLayer);
      }
      if (!state.inZone) continue;
      const open = (longitude: number, latitude: number) => {
        if (isInsideZone(context.zone, [longitude, latitude])) this.options.onClick(longitude, latitude, feature);
      };
      shape.on('click', (event: L.LeafletMouseEvent) => open(event.latlng.lng, event.latlng.lat));
      shape.eachLayer(layer => {
        if (!(layer instanceof L.Path)) return;
        const element = layer.getElement();
        if (!element) return;
        element.setAttribute('data-rnb-id', id);
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', context.buildings.get(id)?.addressLabel ?? footprintBuildingLabel(id));
        element.addEventListener('keydown', event => {
          if (!(event instanceof KeyboardEvent) || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault(); event.stopPropagation();
          const [longitude, latitude] = centerOfRing(ring.map(([lng, lat]) => [lng, lat]));
          open(longitude, latitude);
        });
      });
    }
    this.container.dataset.footprints = String(tiled.size);
  }

  setZones(zones: readonly Zone[], labels: ReadonlyMap<string, string>): void {
    this.zoneLayer.clearLayers();
    for (const zone of zones) {
      const shape = L.polygon(zone.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), {
        color: zone.color, weight: 2.5, opacity: 0.5, fillOpacity: 0.04, dashArray: '10 7', interactive: false
      }).addTo(this.zoneLayer);
      // DOM text avoids interpreting zone names as HTML.
      const label = document.createElement('span'); label.textContent = labels.get(zone.id) ?? zone.name;
      shape.bindTooltip(label, { permanent: true, direction: 'center', className: 'canvas-zone-label' });
    }
  }

  setPosition(fix: PositionFix | null): void {
    this.positionLayer.clearLayers();
    if (!fix) return;
    const point: L.LatLngTuple = [fix.latitude, fix.longitude];
    L.circle(point, { radius: fix.accuracy, color: '#E0A106', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(this.positionLayer);
    L.circleMarker(point, { radius: 5, fillColor: '#E0A106', fillOpacity: 1, color: palette.surface1, weight: 3, interactive: false }).addTo(this.positionLayer);
  }

  getBounds(): L.LatLngBounds { return this.instance.getBounds(); }
  getCenter(): L.LatLng { return this.instance.getCenter(); }
  getZoom(): number { return this.instance.getZoom() - 1; }
  easeTo(options: MapCamera & { duration?: number }): void {
    this.instance.setView([options.center[1], options.center[0]], options.zoom + 1, { animate: false });
  }
  fitBounds(bounds: [[number, number], [number, number]], options: { padding: number; duration?: number }): void {
    this.instance.fitBounds(bounds.map(([lng, lat]) => [lat, lng]) as L.LatLngBoundsLiteral, { padding: [options.padding, options.padding], animate: false });
  }
  setCursor(cursor: string): void { this.container.style.cursor = cursor; }
  remove(): void {
    this.lifetime.abort(); this.footprintRequest?.abort(); clearTimeout(this.moveTimer);
    this.resize.disconnect(); this.instance.remove();
    delete this.container.dataset.basemapReady;
  }
}
