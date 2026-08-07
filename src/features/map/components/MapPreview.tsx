import { lazy, Suspense, useMemo, useState, type ReactElement } from 'react';
import type { Building } from '../../../domain/workspace/models';
import { MemoryOutbox } from '../../../domain/sync/sync-service';
import { BuildingVisitSheet } from '../../buildings/components/BuildingVisitSheet';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../../../infrastructure/memory/workspace-repositories';

const WorkspaceMap = lazy(async () => ({ default: (await import('./WorkspaceMap')).WorkspaceMap }));

export function MapPreview(): ReactElement {
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const repositories = useMemo(() => createMemoryWorkspaceRepositories(demoWorkspace), []);
  const outbox = useMemo(() => new MemoryOutbox(), []);
  return (
    <>
      <Suspense fallback={<div className="workspace-map-loading" aria-label="Chargement de la carte" />}>
        <WorkspaceMap canEditZones onBuildingSelect={setSelectedBuilding} repositories={repositories} />
      </Suspense>
      <BuildingVisitSheet authorId="member-1" building={selectedBuilding} canEditStructure onBuildingChange={setSelectedBuilding} onClose={() => setSelectedBuilding(null)} outbox={outbox} repositories={repositories} />
    </>
  );
}
