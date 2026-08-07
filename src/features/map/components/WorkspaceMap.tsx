import { Map as MapLibreMap, NavigationControl, addProtocol, type GeoJSONSource, type Map } from 'maplibre-gl';
import { PMTiles, Protocol, type Source } from 'pmtiles';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { withBasePath } from '../../../app/config/public-paths';
import type { Building, GeoPoint, Zone, ZoneGeometry } from '../../../domain/workspace/models';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { assertZone } from '../../../domain/workspace/invariants';
import { boundingBoxForPolygon, buildingsAttachedToZone, closePolygon } from '../../zones/model/zone-geometry';
import {
  createBasemapLayers,
  hatchPattern,
  MAP_STYLE_CONFIG,
  moveBasemapLabelsAboveOverlay,
  stripBasemap,
  targetColor,
  targetRadius,
  targetStroke,
  TOWNCENTER_MAP_PALETTE,
} from '../config/map-style';
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

const localMapStyle = {
  version: 8 as const,
  glyphs: withBasePath('/fonts/{fontstack}/{range}.pbf'),
  sources: {},
  layers: []
};

type WorkspaceMapProps = {
  repositories: WorkspaceRepositories;
  canEditZones: boolean;
  canCreateBuildings?: boolean;
  onBuildingSelect?: (building: Building) => void;
  onBuildingLocationSelect?: (location: GeoPoint) => void;
};

function zoneFeatures(zones: readonly Zone[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((zone) => ({
      type: 'Feature' as const,
      properties: { id: zone.id, name: zone.name, surveyed: zone.coverageState === 'complete' },
      geometry: { type: 'Polygon' as const, coordinates: [zone.geometry.coordinates.map(([longitude, latitude]) => [longitude, latitude])] }
    }))
  };
}

function buildingFeatures(buildings: Awaited<ReturnType<WorkspaceRepositories['buildings']['listByViewport']>>): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection' as const,
    features: buildings.map((building) => ({
      type: 'Feature' as const,
      properties: {
        id: building.id,
        label: building.addressLabel,
        zoneId: building.zoneId,
        diameter: 14,
        rank: 3,
        state: 'active',
        selected: false,
      },
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

export function WorkspaceMap({ repositories, canEditZones, canCreateBuildings = false, onBuildingSelect, onBuildingLocationSelect }: WorkspaceMapProps): ReactElement {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const viewportRequest = useRef<AbortController | null>(null);
  const placingBuilding = useRef(false);
  const zones = useRef<readonly Zone[]>([]);
  const [zoneList, setZoneList] = useState<readonly Zone[]>([]);
  const [visibleBuildings, setVisibleBuildings] = useState<readonly Building[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [visibleBuildingCount, setVisibleBuildingCount] = useState(0);
  const [attachedBuildingCount, setAttachedBuildingCount] = useState<number | null>(null);
  const [editing, setEditing] = useState<'drawing' | 'editing' | null>(null);
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

  const refreshViewport = useCallback(async () => {
    const instance = map.current;
    if (!instance) return;
    viewportRequest.current?.abort();
    const controller = new AbortController();
    viewportRequest.current = controller;
    const bounds = instance.getBounds();
    const viewport = { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() };
    element.current?.setAttribute('data-viewport', JSON.stringify(viewport));
    const [nextZones, buildings] = await Promise.all([repositories.zones.list(), repositories.buildings.listByViewport(viewport, { signal: controller.signal })]);
    if (controller.signal.aborted || viewportRequest.current !== controller) return;
    zones.current = nextZones;
    setZoneList(nextZones);
    (instance.getSource('athar-zones') as GeoJSONSource | undefined)?.setData(zoneFeatures(nextZones));
    (instance.getSource('athar-buildings') as GeoJSONSource | undefined)?.setData(buildingFeatures(buildings));
    setVisibleBuildingCount(buildings.length);
    setVisibleBuildings(buildings);
    setSelectedZoneId((current) => current ?? nextZones[0]?.id ?? null);
  }, [repositories]);

  useEffect(() => {
    if (!element.current || map.current) return;
    const instance = new MapLibreMap({
      container: element.current,
      center: [1.4468, 43.6064], zoom: 15.2, pitch: 48, bearing: -12,
      attributionControl: { compact: true },
      style: localMapStyle
    });
    map.current = instance;
    element.current.dataset.basemap = 'local-pmtiles';
    instance.on('error', (event) => console.error('Workspace map error', event.error));
    const initializeWorkspaceLayers = async () => {
      if (instance.getSource('athar-zones')) return;
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
        createBasemapLayers('protomaps', 'protomaps-buildings').forEach((layer) => instance.addLayer(layer));
        stripBasemap(instance, TOWNCENTER_MAP_PALETTE);
      }
        const zoneHatch = hatchPattern(TOWNCENTER_MAP_PALETTE.text3);
        if (zoneHatch) instance.addImage('athar-zone-hatch', zoneHatch);
        instance.addSource('athar-zones', { type: 'geojson', data: zoneFeatures([]) });
        instance.addLayer({
          id: 'athar-zones-fill', type: 'fill', source: 'athar-zones',
          filter: ['==', ['get', 'surveyed'], true],
          paint: { 'fill-color': TOWNCENTER_MAP_PALETTE.accentMark, 'fill-opacity': 0.06 },
        });
        instance.addLayer({
          id: 'athar-zones-hatch', type: 'fill', source: 'athar-zones',
          filter: ['==', ['get', 'surveyed'], false],
          paint: { 'fill-pattern': 'athar-zone-hatch', 'fill-opacity': 0.55 },
        });
        instance.addLayer({
          id: 'athar-zones-line', type: 'line', source: 'athar-zones',
          paint: {
            'line-color': ['case', ['==', ['get', 'surveyed'], true], TOWNCENTER_MAP_PALETTE.accentMark, TOWNCENTER_MAP_PALETTE.text3],
            'line-width': 1.5,
            'line-opacity': 0.75,
          },
        });
        instance.addSource('athar-buildings', { type: 'geojson', data: buildingFeatures([]) });
        instance.addLayer({
          id: 'athar-buildings-glow', type: 'circle', source: 'athar-buildings',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              10, ['+', targetRadius(0.55), 9],
              14, ['+', targetRadius(1), 11],
              18, ['+', targetRadius(1.3), 14],
            ],
            'circle-color': MAP_STYLE_CONFIG.pointGlow.color,
            'circle-opacity': MAP_STYLE_CONFIG.pointGlow.opacity,
            'circle-blur': MAP_STYLE_CONFIG.pointGlow.blur,
            'circle-stroke-width': 0,
          },
        });
        instance.addLayer({
          id: 'athar-buildings-circle', type: 'circle', source: 'athar-buildings',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, targetRadius(0.55), 14, targetRadius(1), 18, targetRadius(1.3)],
            'circle-color': targetColor(TOWNCENTER_MAP_PALETTE),
            'circle-opacity': ['match', ['get', 'state'], 'withdrawn', 0.3, 'dismissed', 0.18, 'taken', 0.95, 0.9],
            'circle-stroke-width': ['case', ['==', ['get', 'state'], 'withdrawn'], 1.5, ['==', ['get', 'selected'], true], 2.5, 1.5],
            'circle-stroke-color': targetStroke(TOWNCENTER_MAP_PALETTE),
            'circle-stroke-opacity': 1,
          },
        });
        instance.moveLayer('buildings-3d', 'athar-buildings-glow');
        moveBasemapLabelsAboveOverlay(instance, 'athar-buildings-glow');
        instance.on('mouseenter', 'athar-buildings-circle', () => { instance.getCanvas().style.cursor = 'pointer'; });
        instance.on('mouseleave', 'athar-buildings-circle', () => { instance.getCanvas().style.cursor = ''; });
        instance.on('click', 'athar-buildings-circle', async (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id !== 'string') return;
          const building = await repositories.buildings.get(id);
          if (building) onBuildingSelect?.(building);
        });
        instance.on('click', (event) => {
          if (!placingBuilding.current) return;
          placingBuilding.current = false;
          onBuildingLocationSelect?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
          setMessage('Emplacement choisi. Completez la fiche du batiment.');
        });
        instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        setMessage('Fond Toulouse local pret.');
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
  }, [onBuildingLocationSelect, onBuildingSelect, refreshViewport, repositories.buildings]);

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
    setMessage('Touchez la carte a l emplacement du batiment.');
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
        {canCreateBuildings && <button className="secondary-action map-tool" disabled={editing !== null} onClick={startBuildingPlacement} type="button">Ajouter un batiment</button>}
        {editing && <button className="primary-action map-tool" disabled={savingZone} onClick={() => void saveZone()} type="button">Enregistrer la zone</button>}
        <button aria-label="Revenir à la vue de dessus" className="secondary-action map-tool map-2d-control" onClick={() => map.current?.easeTo({ pitch: 0, bearing: 0, duration: 450 })} type="button">Vue 2D</button>
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
            <button className="building-chip" key={building.id} onClick={() => onBuildingSelect(building)} type="button">
              {building.addressLabel}
            </button>
          ))}
        </div>
      )}
      <div aria-label="Carte MapLibre des zones" className="workspace-map" ref={element} />
      <p className="workspace-map-message" role="status">{message}</p>
    </section>
  );
}
