import { layers, namedFlavor } from '@protomaps/basemaps';
import { Map as MapLibreMap, NavigationControl, addProtocol, type GeoJSONSource, type Map } from 'maplibre-gl';
import { PMTiles, Protocol, type Source } from 'pmtiles';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { Zone, ZoneGeometry } from '../../../domain/workspace/models';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { boundingBoxForPolygon, buildingsAttachedToZone, closePolygon } from '../../zones/model/zone-geometry';
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
const archive = new PMTiles(new LocalPackageSource('/fixtures/toulouse.pmtiles'));
protocol.add(archive);
addProtocol('pmtiles', protocol.tile);
const basemapLayers = layers('protomaps', namedFlavor('light'), { lang: 'fr' }).filter((layer) => layer.type !== 'symbol');

type WorkspaceMapProps = { repositories: WorkspaceRepositories; canEditZones: boolean };

function zoneFeatures(zones: readonly Zone[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((zone) => ({
      type: 'Feature' as const,
      properties: { id: zone.id, name: zone.name, color: zone.color },
      geometry: { type: 'Polygon' as const, coordinates: [zone.geometry.coordinates.map(([longitude, latitude]) => [longitude, latitude])] }
    }))
  };
}

function buildingFeatures(buildings: Awaited<ReturnType<WorkspaceRepositories['buildings']['listByViewport']>>): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection' as const,
    features: buildings.map((building) => ({
      type: 'Feature' as const,
      properties: { id: building.id, label: building.addressLabel, zoneId: building.zoneId },
      geometry: { type: 'Point' as const, coordinates: [building.location.longitude, building.location.latitude] }
    }))
  };
}

function geometryFromFeature(feature: GeoJSONStoreFeatures): ZoneGeometry | null {
  if (feature.geometry.type !== 'Polygon') return null;
  const coordinates = feature.geometry.coordinates[0];
  if (!coordinates) return null;
  return closePolygon(coordinates.map(([longitude, latitude]) => [longitude, latitude] as [number, number]));
}

export function WorkspaceMap({ repositories, canEditZones }: WorkspaceMapProps): ReactElement {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const zones = useRef<readonly Zone[]>([]);
  const [zoneList, setZoneList] = useState<readonly Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [visibleBuildingCount, setVisibleBuildingCount] = useState(0);
  const [attachedBuildingCount, setAttachedBuildingCount] = useState<number | null>(null);
  const [editing, setEditing] = useState<'drawing' | 'editing' | null>(null);
  const [message, setMessage] = useState('Fond Toulouse local pret.');

  const refreshViewport = useCallback(async () => {
    const instance = map.current;
    if (!instance) return;
    const bounds = instance.getBounds();
    const viewport = { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() };
    element.current?.setAttribute('data-viewport', JSON.stringify(viewport));
    const [nextZones, buildings] = await Promise.all([repositories.zones.list(), repositories.buildings.listByViewport(viewport)]);
    zones.current = nextZones;
    setZoneList(nextZones);
    (instance.getSource('athar-zones') as GeoJSONSource | undefined)?.setData(zoneFeatures(nextZones));
    (instance.getSource('athar-buildings') as GeoJSONSource | undefined)?.setData(buildingFeatures(buildings));
    setVisibleBuildingCount(buildings.length);
    setSelectedZoneId((current) => current ?? nextZones[0]?.id ?? null);
  }, [repositories]);

  useEffect(() => {
    if (!element.current || map.current) return;
    const instance = new MapLibreMap({
      container: element.current,
      center: [1.4468, 43.6064], zoom: 15.2,
      attributionControl: { compact: true }, style: { version: 8, sources: {}, layers: [] }
    });
    map.current = instance;
    instance.on('error', (event) => console.error('Workspace map error', event.error));
    const initializeWorkspaceLayers = () => {
      if (instance.getSource('athar-zones')) return;
      instance.addSource('protomaps', { type: 'vector', tiles: ['pmtiles://athar-toulouse-local/{z}/{x}/{y}'], minzoom: 0, maxzoom: 14, bounds: [1.385, 43.565, 1.5, 43.66] });
        basemapLayers.forEach((layer) => instance.addLayer(layer));
        instance.addSource('athar-zones', { type: 'geojson', data: zoneFeatures([]) });
        instance.addLayer({ id: 'athar-zones-fill', type: 'fill', source: 'athar-zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 } });
        instance.addLayer({ id: 'athar-zones-line', type: 'line', source: 'athar-zones', paint: { 'line-color': ['get', 'color'], 'line-width': 3 } });
        instance.addSource('athar-buildings', { type: 'geojson', data: buildingFeatures([]) });
        instance.addLayer({ id: 'athar-buildings-circle', type: 'circle', source: 'athar-buildings', paint: { 'circle-color': '#17211e', 'circle-radius': 6, 'circle-stroke-color': '#f7f4ed', 'circle-stroke-width': 2 } });
        instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        void refreshViewport();
    };
    instance.once('style.load', initializeWorkspaceLayers);
    const fallbackInitialization = window.setTimeout(() => {
      try { initializeWorkspaceLayers(); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Carte indisponible.'); }
    }, 0);
    instance.on('moveend', () => { void refreshViewport(); });
    return () => { window.clearTimeout(fallbackInitialization); draw.current?.stop(); draw.current = null; map.current?.remove(); map.current = null; };
  }, [refreshViewport]);

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
    setEditing('drawing');
    setAttachedBuildingCount(null);
    setMessage('Tracez le contour, puis fermez le polygone.');
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
    setEditing('editing');
    setAttachedBuildingCount(null);
    setMessage(`Edition de ${zone.name}. Deplacez les sommets puis enregistrez.`);
  };

  const saveZone = async () => {
    const draft = draw.current?.getSnapshot().map(geometryFromFeature).find((geometry): geometry is ZoneGeometry => geometry !== null);
    if (!draft) { setMessage('Aucun polygone valide a enregistrer.'); return; }
    const previous = zones.current.find((zone) => zone.id === selectedZoneId);
    const id = previous?.id ?? `zone-${crypto.randomUUID()}`;
    const zone: Zone = {
      id, name: previous?.name ?? 'Nouvelle zone', color: previous?.color ?? '#16835F',
      coverageState: previous?.coverageState ?? 'unassigned', assigneeLabel: previous?.assigneeLabel ?? null,
      geometry: draft, bbox: boundingBoxForPolygon(draft)
    };
    await repositories.zones.save(zone);
    const buildings = await repositories.buildings.listByViewport(zone.bbox);
    setAttachedBuildingCount(buildingsAttachedToZone(zone, buildings).length);
    setSelectedZoneId(zone.id);
    draw.current?.stop();
    draw.current = null;
    setEditing(null);
    setMessage(`Zone enregistree localement. ${buildingsAttachedToZone(zone, buildings).length} batiment(s) rattache(s) par point-dans-polygone.`);
    await refreshViewport();
  };

  return (
    <section className="workspace-map-shell" aria-label="Carte des zones et batiments">
      <header className="workspace-map-header">
        <div><p className="eyebrow">Athar / carte locale</p><h1>Zones de Toulouse</h1></div>
        <div className="workspace-map-metrics"><span>{visibleBuildingCount} batiment(s) visibles</span>{attachedBuildingCount !== null && <span>{attachedBuildingCount} rattache(s)</span>}</div>
      </header>
      <div className="workspace-map-tools" aria-label="Outils de zone">
        <select aria-label="Zone a modifier" value={selectedZoneId ?? ''} onChange={(event) => setSelectedZoneId(event.target.value)}>
          {zoneList.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select>
        {canEditZones && <button className="secondary-action map-tool" disabled={editing !== null} onClick={startDrawing} type="button">Dessiner une zone</button>}
        {canEditZones && <button className="secondary-action map-tool" disabled={editing !== null || !selectedZoneId} onClick={startEditing} type="button">Modifier la zone</button>}
        {editing && <button className="primary-action map-tool" onClick={() => void saveZone()} type="button">Enregistrer</button>}
      </div>
      <div aria-label="Carte MapLibre des zones" className="workspace-map" ref={element} />
      <p className="workspace-map-message" role="status">{message}</p>
    </section>
  );
}
