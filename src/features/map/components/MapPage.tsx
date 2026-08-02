import { lazy, Suspense, useMemo, type ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { demoWorkspace } from '../../../infrastructure/demo/demo-workspace';
import { createMemoryWorkspaceRepositories } from '../../../infrastructure/memory/workspace-repositories';

const WorkspaceMap = lazy(async () => ({ default: (await import('./WorkspaceMap')).WorkspaceMap }));

export function MapPage(): ReactElement {
  const { state } = useAuth();
  const repositories = useMemo(() => createMemoryWorkspaceRepositories(demoWorkspace), []);
  if (state.status !== 'active') throw new Error('MapPage requires an active session.');
  return (
    <main className="map-page">
      <Suspense fallback={<div className="workspace-map-loading" aria-label="Chargement de la carte" />}>
        <WorkspaceMap canEditZones={state.session.member.role === 'admin'} repositories={repositories} />
      </Suspense>
    </main>
  );
}
