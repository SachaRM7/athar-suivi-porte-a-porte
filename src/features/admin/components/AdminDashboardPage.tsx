import { DeviceSyncSummary } from '../../outings/components/DeviceSyncSummary';
import { readTask } from '../../../shared/async/read-task';
import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { environment } from '../../../app/config/environment';
import { AppLink } from '../../../app/routes/router';
import type { Building, Status, Zone, ZoneStats } from '../../../domain/workspace/models';
import { createFirestoreWorkspaceReadRepositories } from '../../../infrastructure/firestore/firestore-workspace-read-repositories';
import type { ReadMetrics } from '../../../domain/workspace/read-pagination';
import { useGuardedSignOut } from '../../auth/components/GuardedSignOut';
import { zoneDoorProgress } from '../../../domain/workspace/zone-progress';
import { zoneProgressDate, zoneProgressSummary, zoneStatsProvenance, zoneBuildingCoverage } from '../../zones/model/zone-progress-label';

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

export function AdminDashboardPage(): ReactElement {
  const { state } = useAuth();
  const guardedSignOut = useGuardedSignOut();
  if (state.status !== 'active') throw new Error('AdminDashboardPage requires an active session.');
  const [refreshVersion, setRefreshVersion] = useState(0);
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
      const [zones, statuses] = await readTask(Promise.all([workspace.zones.list(), workspace.statuses.list()]));
      if (!mounted) return;
      setData({ zones, statuses });
      setSelectedZoneId((current) => current || zones[0]?.id || '');
    }).catch(() => {
      if (mounted) setError('Les donnees de pilotage ne peuvent pas etre lues pour le moment.');
    });
    return () => { mounted = false; };
  }, [repositories, refreshVersion]);

  useEffect(() => {
    if (!selectedZoneId) return;
    let mounted = true;
    const controller = new AbortController();
    void repositories.then(async (workspace) => {
      const [statsResult, buildingsResult] = await Promise.allSettled([
        readTask(workspace.zones.getStats(selectedZoneId), controller.signal),
        readTask(workspace.buildings.listPageByZone(selectedZoneId, { cursor: buildingCursor, pageSize: 50, signal: controller.signal }), controller.signal)
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
  }, [buildingCursor, repositories, selectedZoneId, refreshVersion]);

  const [liveStats, setLiveStats] = useState<{ zoneId: string; stats: ZoneStats | null; invalid: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void repositories.then(workspace => {
      if (!active || !selectedZoneId) return;
      stop = workspace.zones.subscribeStats?.(selectedZoneId,
        stats => { if (active) setLiveStats({ zoneId: selectedZoneId, stats, invalid: false }); },
        () => { if (active) setLiveStats({ zoneId: selectedZoneId, stats: null, invalid: true }); });
    });
    return () => { active = false; stop?.(); };
  }, [repositories, selectedZoneId]);

  const selectedZone = data?.zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const selectedDetails = zoneDetails?.zoneId === selectedZoneId ? zoneDetails : null;
  const selectedZoneError = zoneIssue?.zoneId === selectedZoneId ? zoneIssue.message : null;
  const zoneLoading = Boolean(selectedZoneId && !selectedDetails && !selectedZoneError);
  const selectedStats = selectedZoneError ? null : liveStats?.zoneId === selectedZoneId ? liveStats.stats : selectedDetails?.stats ?? null;
  const selectedBuildings = selectedDetails?.buildings ?? [];
  const progress = zoneDoorProgress(selectedStats, selectedZoneId);
  const selectedStatus = data?.statuses.find((status) => status.id === selectedStatusId) ?? null;
  const selectedStatusCount = !selectedStats ? '-' : selectedStatus ? selectedStats.countsByStatus[selectedStatus.id] ?? 0 : selectedStats.doorCount;
  const missingStatusLabels = selectedStats && Object.entries(selectedStats.countsByStatus)
    .some(([id, count]) => count > 0 && !data?.statuses.some((status) => status.id === id));

  function selectZone(zoneId: string): void {
    setZoneDetails(null); setZoneIssue(null);
    setSelectedZoneId(zoneId);
    setBuildingCursor(null);
    setPreviousBuildingCursors([]);
  }

  function nextBuildingPage(): void {
    if (!selectedDetails?.nextCursor) return;
    setPreviousBuildingCursors((current) => [...current, buildingCursor]);
    setZoneDetails(null);
    setBuildingCursor(selectedDetails.nextCursor);
  }

  function previousBuildingPage(): void {
    setZoneDetails(null);
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
          <AppLink className="text-link" href="/outings">Sorties et bilans</AppLink>
          <AppLink className="text-link" href="/admin/members">Membres</AppLink>
          <button className="secondary-action" onClick={guardedSignOut.request} type="button">Se deconnecter</button>
          {guardedSignOut.dialog}
        </nav>
      </header>

      <DeviceSyncSummary userId={state.session.member.id} />
      <button className="secondary-action" onClick={() => { setData(null); setZoneDetails(null); setZoneIssue(null); setError(null); setRefreshVersion(value => value + 1); }} type="button">Actualiser le pilotage</button>
      {data?.zones.length === 0 && <p>Crée une zone depuis le mode Édition de la carte pour commencer le pilotage.</p>}
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
            <label>Compteur à afficher
              <select aria-label="Compteur par statut" onChange={(event) => setSelectedStatusId(event.target.value)} value={selectedStatusId}>
                <option value="all">Tous les statuts</option>
                {data.statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
              </select>
            </label>
            <p className="dashboard-projection-note">{zoneStatsProvenance(selectedStats)} {zoneBuildingCoverage(selectedStats)}. Les compteurs décrivent le dernier relevé enregistré. Les nouveaux passages peuvent ne pas encore être comptés. Le choix du compteur ne filtre pas les bâtiments.</p>
          </section>

          {zoneLoading && <p className="dashboard-loading" role="status">Lecture de la zone selectionnee...</p>}
          {selectedZoneError && <p className="form-error" role="alert">{selectedZoneError}</p>}
          {(liveStats?.zoneId === selectedZoneId ? liveStats.invalid : selectedDetails?.projectionInvalid) && <p className="form-error" role="alert">Projection de compteurs invalide. Les batiments restent consultables.</p>}
          {missingStatusLabels && <p className="dashboard-projection-note" role="status">La liste des statuts est incomplète. Le total et la progression incluent aussi les portes dont le statut n’est pas affiché ci-dessous.</p>}

          <section className="dashboard-overview" aria-labelledby="zone-summary-title">
            <div>
              <p className="eyebrow">Zone suivie</p>
              <h2 id="zone-summary-title">{selectedZone.name}</h2>
              <p>{selectedZone.assigneeLabel ? `Terrain : ${selectedZone.assigneeLabel}` : 'Terrain non assigne'}</p>
            </div>
            <div className="dashboard-progress" style={{ '--progress': `${progress.percent ?? 0}%` } as CSSProperties}>
              <strong data-testid="zone-recorded-progress">{progress.percent === null ? '—' : `${progress.percent}%`}</strong>
              <span>{zoneProgressSummary(progress)}</span>
            </div>
          </section>
          <p className="dashboard-projection-note">{zoneBuildingCoverage(selectedStats)}.</p>

          <section className="pilotage-section" aria-label="Qualité des données"><h2>Qualité des données</h2><p>{selectedStats?.schemaVersion === 2 ? `${selectedStats.buildingCount ?? 'Indisponible'} bâtiments suivis · ${selectedStats.describedBuildingCount ?? 'Indisponible'} décrits · ${selectedStats.visitedBuildingCount ?? 'Indisponible'} avec passage` : 'Reconstruction vérifiée indisponible. Les valeurs historiques ne prouvent pas une couverture complète.'}</p><p>{selectedStats?.schemaVersion === 2 && selectedStats.buildingCount != null && selectedStats.describedBuildingCount != null ? `${selectedStats.buildingCount - selectedStats.describedBuildingCount} bâtiments suivis à décrire.` : 'Bâtiments à décrire : indisponible.'} Les bâtiments du catalogue encore absents de Firestore sont comptés uniquement si le catalogue complet est connu.</p></section>

          <section className="dashboard-metrics" aria-label="Compteurs de zone">
            <article><span>Portes suivies</span><strong data-testid="zone-door-count">{selectedStats?.doorCount ?? '-'}</strong></article>
            <article><span>{selectedStatus ? selectedStatus.label : 'Toutes portes'}</span><strong data-testid="zone-status-count">{selectedStatusCount}</strong></article>
            <article><span>Batiments lus</span><strong data-testid="zone-building-count">{selectedBuildings.length}</strong></article>
            <article><span>Date du relevé</span><strong>{zoneProgressDate(progress)}</strong></article>
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
              {selectedBuildings.map((building) => <li key={building.id}><span>{building.addressLabel}</span><AppLink className="text-link" href={`/?zone=${encodeURIComponent(building.zoneId)}`}>Ouvrir la zone</AppLink></li>)}
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
