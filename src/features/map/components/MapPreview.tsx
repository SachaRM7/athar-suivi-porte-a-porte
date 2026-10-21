import { MapLoadingBoundary } from './MapLoadingBoundary';
import { readTask } from '../../../shared/async/read-task';
import { lazy, Suspense, useCallback, useMemo, useState, type ReactElement } from 'react';
import type { Building } from '../../../domain/workspace/models';
import { MemoryOutbox } from '../../../domain/sync/sync-service';
import { MemoryDoorMarkerOutbox } from '../../../domain/sync/door-marker-outbox';
import { BuildingVisitSheet } from '../../buildings/components/BuildingVisitSheet';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../../../infrastructure/memory/workspace-repositories';
import { useOpenedBuilding } from '../model/use-opened-building';

const WorkspaceMap = lazy(async () => ({ default: (await readTask(import('./WorkspaceMap'), undefined, 30_000)).WorkspaceMap }));

/**
 * Route de régression : elle travaille sur le jeu de démonstration, donc sur l'échantillon
 * d'emprises versionné. Le tuileset départemental n'a rien à faire ici.
 */
const DEMO_ARCHIVES = ['/fixtures/batiments-carmes.pmtiles'] as const;

export function MapPreview(): ReactElement {
  const [dataVersion, setDataVersion] = useState(0);
  const repositories = useMemo(() => createMemoryWorkspaceRepositories(demoWorkspace), []);
  const outbox = useMemo(() => new MemoryOutbox(), []);
  const markers = useMemo(() => new MemoryDoorMarkerOutbox(), []);
  const opened = useOpenedBuilding(repositories);
  const changeBuilding = useCallback((building: Building) => {
    opened.select(building, { persisted: true, suggestion: null });
    setDataVersion((version) => version + 1);
  }, [opened]);
  const renameBuilding = useCallback(async (addressLabel: string) => {
    const wasPersisted = opened.persisted;
    await opened.rename(addressLabel);
    if (wasPersisted) setDataVersion((version) => version + 1);
  }, [opened]);
  return (
    <>
      <MapLoadingBoundary><Suspense fallback={<div className="workspace-map-loading" role="status">Chargement de la carte…</div>}>
        <WorkspaceMap
          authorId="member-1"
          canCreateBuildings
          canEditZones
          footprintArchives={DEMO_ARCHIVES}
          onBuildingSelect={opened.select}
          reloadToken={dataVersion}
          repositories={repositories}
        />
      </Suspense></MapLoadingBoundary>
      <BuildingVisitSheet
        authorId="member-1"
        building={opened.building}
        canDeleteVisitedDoors
        canEditStructure
        ensureBuildingExists={opened.ensureExists}
        markers={markers}
        onBuildingChange={changeBuilding}
        canRenameBuilding
        onRenameBuilding={renameBuilding}
        onBuildingDelete={() => setDataVersion((version) => version + 1)}
        onClose={opened.close}
        outbox={outbox}
        repositories={repositories}
        structureSuggestion={opened.suggestion}
      />
    </>
  );
}
