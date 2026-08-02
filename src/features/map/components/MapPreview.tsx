import { lazy, Suspense, useMemo, type ReactElement } from 'react';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../../../infrastructure/memory/workspace-repositories';

const WorkspaceMap = lazy(async () => ({ default: (await import('./WorkspaceMap')).WorkspaceMap }));

export function MapPreview(): ReactElement {
  const repositories = useMemo(() => createMemoryWorkspaceRepositories(demoWorkspace), []);
  return <Suspense fallback={<div className="workspace-map-loading" aria-label="Chargement de la carte" />}><WorkspaceMap canEditZones repositories={repositories} /></Suspense>;
}
