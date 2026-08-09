import { lazy, Suspense, useCallback, useMemo, useState, type ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { environment } from '../../../app/config/environment';
import type { Building, WorkspaceMember } from '../../../domain/workspace/models';
import { BuildingVisitSheet } from '../../buildings/components/BuildingVisitSheet';
import { InitialAdminSettings } from '../../settings/InitialAdminSettings';
import { getFirebaseClient } from '../../../infrastructure/firebase/client';
import { FirestoreBuildingStructureGateway } from '../../../infrastructure/firestore/firestore-building-structure-gateway';
import { FirestoreBuildingGateway } from '../../../infrastructure/firestore/firestore-building-gateway';
import { FirestoreZoneGateway } from '../../../infrastructure/firestore/firestore-zone-gateway';
import { claimInitialAdminWithFunction } from '../../../infrastructure/firebase/initial-admin-gateway';
import { createFirestoreWorkspaceReadRepositories } from '../../../infrastructure/firestore/firestore-workspace-read-repositories';
import { createTerrainSessionRepositories } from '../../../infrastructure/firestore/terrain-session-repositories';
import { IndexedDbDoorMarkerOutbox, IndexedDbOutbox } from '../../../infrastructure/outbox/indexeddb-outbox';
import { useFieldVisitSync } from '../../visits/model/use-field-visit-sync';
import { useOpenedBuilding } from '../model/use-opened-building';

const WorkspaceMap = lazy(async () => ({ default: (await import('./WorkspaceMap')).WorkspaceMap }));

export function MapPage(): ReactElement {
  const { state, signOut } = useAuth();
  const session = state.status === 'active' ? state.session : null;
  if (!session) throw new Error('MapPage requires an active session.');
  return <ActiveMapPage member={session.member} onSignOut={signOut} />;
}

function ActiveMapPage({ member, onSignOut }: { member: WorkspaceMember; onSignOut(): Promise<void> }): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const initialZoneId = useMemo(() => new URLSearchParams(window.location.search).get('zone'), []);
  const outbox = useMemo(() => new IndexedDbOutbox(member.id), [member.id]);
  const markers = useMemo(() => new IndexedDbDoorMarkerOutbox(member.id), [member.id]);
  const repositories = useMemo(() => {
    const client = getFirebaseClient();
    return createTerrainSessionRepositories({
      remote: createFirestoreWorkspaceReadRepositories(client.firestore, environment.workspaceId, { source: 'cache-aware' }),
      member,
      outbox,
      structureWriter: new FirestoreBuildingStructureGateway(
        client.firestore,
        environment.workspaceId,
        () => client.auth.currentUser?.uid ?? null,
        {
          projectId: client.app.options.projectId ?? '',
          getIdToken: async () => client.auth.currentUser?.getIdToken() ?? null
        }
      ),
      zoneWriter: new FirestoreZoneGateway(
        client.firestore,
        environment.workspaceId,
        () => client.auth.currentUser?.uid ?? null
      ),
      buildingWriter: new FirestoreBuildingGateway(
        client.firestore,
        environment.workspaceId,
        () => client.auth.currentUser?.uid ?? null
      )
    });
  }, [member, outbox]);
  const sync = useFieldVisitSync(member.id, outbox, markers, repositories);
  const opened = useOpenedBuilding(repositories);
  // La structure vient d'être écrite : la suggestion cadastrale n'a plus rien à proposer.
  const changeBuilding = useCallback((building: Building) => opened.select(building, { persisted: true, suggestion: null }), [opened]);
  const account = useMemo(
    () => ({ displayName: member.displayName, onOpenSettings: () => setSettingsOpen(true), onSignOut: () => void onSignOut() }),
    [member.displayName, onSignOut]
  );
  const initialAdmin = useMemo(() => {
    const client = getFirebaseClient();
    return (code: string) => claimInitialAdminWithFunction(client.functions, client.auth.currentUser, code);
  }, []);
  return (
    <main className="map-page">
      <Suspense fallback={<div className="workspace-map-loading" aria-label="Chargement de la carte" />}>
        <WorkspaceMap
          account={account}
          authorId={member.id}
          canCreateBuildings
          canEditZones={member.role === 'admin'}
          initialZoneId={initialZoneId}
          onBuildingSelect={opened.select}
          repositories={repositories}
        />
      </Suspense>
      <BuildingVisitSheet
        authorId={member.id}
        building={opened.building}
        canDeleteVisitedDoors={member.role === 'admin'}
        canEditStructure
        ensureBuildingExists={opened.ensureExists}
        markers={markers}
        onBuildingChange={changeBuilding}
        onClose={opened.close}
        outbox={outbox}
        repositories={repositories}
        structureSuggestion={opened.suggestion}
        sync={sync}
      />
      {settingsOpen && <InitialAdminSettings allowInitialAdminActivation={environment.firebase?.useEmulators === true} member={member} onActivate={initialAdmin} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
