import { useEffect, useRef, type ReactElement } from 'react';
import { addProtocol, Map as MapLibreMap, NavigationControl, type Map } from 'maplibre-gl';
import { PMTiles, Protocol, type Source } from 'pmtiles';
import { withBasePath } from '../../../app/config/public-paths';
import { createBasemapLayers, MAP_STYLE_CONFIG, stripBasemap, TOWNCENTER_MAP_PALETTE } from '../config/map-style';
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
const queryableLayerIds = createBasemapLayers('protomaps', 'protomaps-buildings').filter((layer) => layer.type !== 'background').map((layer) => layer.id);

export default function OfflineMap(): ReactElement {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);

  useEffect(() => {
    if (!element.current || map.current) return;
    let cancelled = false;
    void archive.getHeader().then(async (header) => {
      const centerTile = await archive.getZxy(14, 8257, 5982);
      if (!centerTile) throw new Error('The Toulouse center tile is missing from the offline package');
      if (cancelled || !element.current) return;
      element.current.dataset.archiveReady = 'true';
      element.current.dataset.centerTileBytes = String(centerTile.data.byteLength);
      const instance = new MapLibreMap({
        container: element.current, center: [1.4398, 43.6083], zoom: 14.7,
        attributionControl: { compact: true },
         style: { version: 8, glyphs: withBasePath('/fonts/{fontstack}/{range}.pbf'), sources: {}, layers: [] }, pitch: 48, bearing: -12
      });
      map.current = instance;
      instance.on('error', (event) => console.error('MapLibre offline map error', event.error));
      instance.once('load', () => {
         instance.addSource('protomaps', { type: 'vector', tiles: ['pmtiles://athar-toulouse-local/{z}/{x}/{y}'], minzoom: header.minZoom, maxzoom: header.maxZoom, bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat], attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
         instance.addSource('protomaps-buildings', { type: 'vector', tiles: ['pmtiles://athar-toulouse-local/{z}/{x}/{y}'], minzoom: header.minZoom, maxzoom: Math.min(header.maxZoom, MAP_STYLE_CONFIG.buildingTileMaxZoom), bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat] });
         createBasemapLayers('protomaps', 'protomaps-buildings').forEach((layer) => instance.addLayer(layer));
         stripBasemap(instance, TOWNCENTER_MAP_PALETTE);
      });
      instance.on('idle', () => { if (element.current) element.current.dataset.mapReady = 'true'; });
      instance.on('render', () => {
        if (!element.current || !instance.isStyleLoaded()) return;
        const loaded = queryableLayerIds.filter((layerId) => instance.getLayer(layerId));
        element.current.dataset.renderedFeatures = String(loaded.length === 0 ? 0 : instance.queryRenderedFeatures({ layers: loaded }).length);
      });
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    }).catch((error: unknown) => console.error('PMTiles offline package error', error));
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  return <div aria-label="Carte MapLibre de test" className="map" ref={element} />;
}
