import { lazy, Suspense, useCallback, useMemo, useState, type ReactElement } from 'react';
import type { Building, GeoPoint } from '../../../domain/workspace/models';
import { MemoryOutbox } from '../../../domain/sync/sync-service';
import { MemoryDoorMarkerOutbox } from '../../../domain/sync/door-marker-outbox';
import { BuildingCreationSheet } from '../../buildings/components/BuildingCreationSheet';
import { BuildingVisitSheet } from '../../buildings/components/BuildingVisitSheet';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../../../infrastructure/memory/workspace-repositories';
import { useOpenedBuilding } from '../model/use-opened-building';

const WorkspaceMap = lazy(async () => ({ default: (await import('./WorkspaceMap')).WorkspaceMap }));

/**
 * Route de régression : elle travaille sur le jeu de démonstration, donc sur l'échantillon
 * d'emprises versionné. Le tuileset départemental n'a rien à faire ici.
 */
const DEMO_ARCHIVES = ['/fixtures/batiments-carmes.pmtiles'] as const;

export function MapPreview(): ReactElement {
  const repositories = useMemo(() => createMemoryWorkspaceRepositories(demoWorkspace), []);
  const outbox = useMemo(() => new MemoryOutbox(), []);
  const markers = useMemo(() => new MemoryDoorMarkerOutbox(), []);
  const opened = useOpenedBuilding(repositories);
  const [newBuildingLocation, setNewBuildingLocation] = useState<GeoPoint | null>(null);
  const changeBuilding = useCallback((building: Building) => opened.select(building, { persisted: true }), [opened]);
  return (
    <>
      <Suspense fallback={<div className="workspace-map-loading" aria-label="Chargement de la carte" />}>
        <WorkspaceMap
          authorId="member-1"
          canCreateBuildings
          canEditZones
          footprintArchives={DEMO_ARCHIVES}
          onBuildingLocationSelect={setNewBuildingLocation}
          onBuildingSelect={opened.select}
          repositories={repositories}
        />
      </Suspense>
      <BuildingVisitSheet
        authorId="member-1"
        building={opened.building}
        canEditStructure
        ensureBuildingExists={opened.ensureExists}
        markers={markers}
        onBuildingChange={changeBuilding}
        onClose={opened.close}
        outbox={outbox}
        repositories={repositories}
      />
      <BuildingCreationSheet authorId="member-1" location={newBuildingLocation} onClose={() => setNewBuildingLocation(null)} onCreated={changeBuilding} repositories={repositories} />
    </>
  );
}
