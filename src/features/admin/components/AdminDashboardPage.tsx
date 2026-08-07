import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { environment } from '../../../app/config/environment';
import { AppLink } from '../../../app/routes/router';
import type { Building, Status, Zone, ZoneStats } from '../../../domain/workspace/models';
import { createFirestoreWorkspaceReadRepositories } from '../../../infrastructure/firestore/firestore-workspace-read-repositories';
import type { ReadMetrics } from '../../../domain/workspace/read-pagination';

type DashboardData = {
  zones: readonly Zone[];
  statuses: readonly Status[];
};

type ZoneDetails = {
  zoneId: string;
  stats: ZoneStats | null;
  buildings: readonly Building[];
  nextCursor: string | null;
  metrics: ReadMetrics;
  projectionInvalid: boolean;
};

type ZoneIssue = {
  zoneId: string;
  message: string;
};

function percentage(stats: ZoneStats | null, unvisitedStatusId: string | undefined): number {
  if (!stats || stats.doorCount === 0) return 0;
  const unvisited = unvisitedStatusId ? stats.countsByStatus[unvisitedStatusId] ?? 0 : 0;
  return Math.max(0, Math.min(100, Math.round(((stats.doorCount - unvisited) / stats.doorCount) * 100)));
}

function formatUpdatedAt(stats: ZoneStats | null): string {
  if (!stats) return 'Projection indisponible';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stats.updatedAt));
}

export function AdminDashboardPage(): ReactElement {
  const { state, signOut } = useAuth();
  if (state.status !== 'active') throw new Error('AdminDashboardPage requires an active session.');
  const [data, setData] = useState<DashboardData | null>(null);
  const [zoneDetails, setZoneDetails] = useState<ZoneDetails | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [buildingCursor, setBuildingCursor] = useState<string | null>(null);
  const [previousBuildingCursors, setPreviousBuildingCursors] = useState<readonly (string | null)[]>([]);
  const [selectedStatusId, setSelectedStatusId] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [zoneIssue, setZoneIssue] = useState<ZoneIssue | null>(null);

  const repositories = useMemo(() => {
    // This dashboard is intentionally read-only; terrain keeps its local repositories.
    return import('../../../infrastructure/firebase/client').then(({ getFirebaseClient }) =>
      createFirestoreWorkspaceReadRepositories(getFirebaseClient().firestore, environment.workspaceId)
    );
  }, []);

  useEffect(() => {
    let mounted = true;
    void repositories.then(async (workspace) => {
      const [zones, statuses] = await Promise.all([workspace.zones.list(), workspace.statuses.list()]);
      if (!mounted) return;
      setData({ zones, statuses });
      setSelectedZoneId((current) => current || zones[0]?.id || '');
    }).catch(() => {
      if (mounted) setError('Les donnees de pilotage ne peuvent pas etre lues pour le moment.');
    });
    return () => { mounted = false; };
  }, [repositories]);

  useEffect(() => {
    if (!selectedZoneId) return;
    let mounted = true;
    const controller = new AbortController();
    void repositories.then(async (workspace) => {
      const [statsResult, buildingsResult] = await Promise.allSettled([
        workspace.zones.getStats(selectedZoneId),
        workspace.buildings.listPageByZone(selectedZoneId, { cursor: buildingCursor, pageSize: 50, signal: controller.signal })
      ]);
      if (!mounted) return;
      if (buildingsResult.status === 'rejected') {
        setZoneIssue({ zoneId: selectedZoneId, message: 'Les batiments de cette zone ne peuvent pas etre lus ou depassent le budget autorise.' });
        return;
      }
      setZoneIssue(null);
      setZoneDetails({
        zoneId: selectedZoneId,
        stats: statsResult.status === 'fulfilled' ? statsResult.value : null,
        buildings: buildingsResult.value.items,
        nextCursor: buildingsResult.value.nextCursor,
        metrics: buildingsResult.value.metrics,
        projectionInvalid: statsResult.status === 'rejected'
      });
    }).catch(() => {
      if (mounted) setZoneIssue({ zoneId: selectedZoneId, message: 'Les donnees de cette zone ne peuvent pas etre lues pour le moment.' });
    });
    return () => { mounted = false; controller.abort(); };
  }, [buildingCursor, repositories, selectedZoneId]);

  const selectedZone = data?.zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const selectedDetails = zoneDetails?.zoneId === selectedZoneId ? zoneDetails : null;
  const selectedZoneError = zoneIssue?.zoneId === selectedZoneId ? zoneIssue.message : null;
  const zoneLoading = Boolean(selectedZoneId && !selectedDetails && !selectedZoneError);
  const selectedStats = selectedDetails?.stats ?? null;
  const selectedBuildings = selectedDetails?.buildings ?? [];
  const unvisitedStatusId = data?.statuses.find((status) => status.id === 'unvisited')?.id;
  const selectedStatus = data?.statuses.find((status) => status.id === selectedStatusId) ?? null;
  const selectedStatusCount = !selectedStats ? '-' : selectedStatus ? selectedStats.countsByStatus[selectedStatus.id] ?? 0 : selectedStats.doorCount;

  function selectZone(zoneId: string): void {
    setSelectedZoneId(zoneId);
    setBuildingCursor(null);
    setPreviousBuildingCursors([]);
  }

  function nextBuildingPage(): void {
    if (!selectedDetails?.nextCursor) return;
    setPreviousBuildingCursors((current) => [...current, buildingCursor]);
    setBuildingCursor(selectedDetails.nextCursor);
  }

  function previousBuildingPage(): void {
    setBuildingCursor(previousBuildingCursors.at(-1) ?? null);
    setPreviousBuildingCursors((current) => current.slice(0, -1));
  }

  return (
    <main className="admin-dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Pilotage / administrateur</p>
          <h1>Couverture terrain</h1>
        </div>
        <nav aria-label="Navigation administration" className="dashboard-nav">
          <AppLink className="text-link" href="/">Carte terrain</AppLink>
          <AppLink className="text-link" href="/admin/members">Membres</AppLink>
          <button className="secondary-action" onClick={() => void signOut()} type="button">Se deconnecter</button>
        </nav>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {!data && !error && <p className="dashboard-loading" role="status">Lecture des zones et projections...</p>}
      {data && selectedZone && (
        <>
          <section className="dashboard-control-band" aria-label="Filtres de pilotage">
            <label>Zone
              <select aria-label="Zone suivie" onChange={(event) => selectZone(event.target.value)} value={selectedZone.id}>
                {data.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
            </label>
            <label>Statut
              <select aria-label="Filtre par statut" onChange={(event) => setSelectedStatusId(event.target.value)} value={selectedStatusId}>
                <option value="all">Tous les statuts</option>
                {data.statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
              </select>
            </label>
            <p className="dashboard-projection-note">zoneStats est une projection de lecture reparable, jamais la source de verite.</p>
          </section>

          {zoneLoading && <p className="dashboard-loading" role="status">Lecture de la zone selectionnee...</p>}
          {selectedZoneError && <p className="form-error" role="alert">{selectedZoneError}</p>}
          {selectedDetails?.projectionInvalid && <p className="form-error" role="alert">Projection de compteurs invalide. Les batiments restent consultables.</p>}

          <section className="dashboard-overview" aria-labelledby="zone-summary-title">
            <div>
              <p className="eyebrow">Zone suivie</p>
              <h2 id="zone-summary-title">{selectedZone.name}</h2>
              <p>{selectedZone.assigneeLabel ? `Terrain : ${selectedZone.assigneeLabel}` : 'Terrain non assigne'}</p>
            </div>
            <div className="dashboard-progress" style={{ '--progress': `${percentage(selectedStats, unvisitedStatusId)}%` } as CSSProperties}>
              <strong>{percentage(selectedStats, unvisitedStatusId)}%</strong>
              <span>de portes traitees</span>
            </div>
          </section>

          <section className="dashboard-metrics" aria-label="Compteurs de zone">
            <article><span>Portes suivies</span><strong data-testid="zone-door-count">{selectedStats?.doorCount ?? '-'}</strong></article>
            <article><span>{selectedStatus ? selectedStatus.label : 'Toutes portes'}</span><strong data-testid="zone-status-count">{selectedStatusCount}</strong></article>
            <article><span>Batiments lus</span><strong data-testid="zone-building-count">{selectedBuildings.length}</strong></article>
            <article><span>Projection mise a jour</span><strong>{formatUpdatedAt(selectedStats)}</strong></article>
          </section>

          <section className="dashboard-statuses" aria-label="Repartition par statut">
            {data.statuses.map((status) => {
              const count = selectedStats ? selectedStats.countsByStatus[status.id] ?? 0 : '-';
              return <button aria-pressed={selectedStatusId === status.id} className="dashboard-status" key={status.id} onClick={() => setSelectedStatusId(status.id)} style={{ '--status-color': status.color } as CSSProperties} type="button">
                <span>{status.label}</span><strong>{count}</strong>
              </button>;
            })}
          </section>

          <section className="dashboard-buildings" aria-labelledby="zone-buildings-title">
            <div className="dashboard-section-heading">
              <div><p className="eyebrow">Lecture bornee a la zone</p><h2 id="zone-buildings-title">Batiments concernes</h2></div>
              <span>{selectedBuildings.length} affiches / {selectedDetails?.metrics.documentsRead ?? 0} lus</span>
            </div>
            <ul>
              {selectedBuildings.map((building) => <li key={building.id}><span>{building.addressLabel}</span><small>structure r.{building.structureRevision}</small></li>)}
            </ul>
            <nav aria-label="Pages de batiments" className="dashboard-pagination">
              <button className="secondary-action" disabled={previousBuildingCursors.length === 0 || zoneLoading} onClick={previousBuildingPage} type="button">Precedents</button>
              <span>{buildingCursor ? 'Page suivante' : 'Premiere page'}{selectedDetails?.nextCursor ? ', autres batiments disponibles' : ''}</span>
              <button className="secondary-action" disabled={!selectedDetails?.nextCursor || zoneLoading} onClick={nextBuildingPage} type="button">Suivants</button>
            </nav>
          </section>
        </>
      )}
    </main>
  );
}
