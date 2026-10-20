import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { AppLink } from '../../../app/routes/router';
import { environment } from '../../../app/config/environment';
import { Dialog } from '../../../design/components/Dialog';
import type { Zone } from '../../../domain/workspace/models';
import { getFirebaseClient } from '../../../infrastructure/firebase/client';
import { createFirestoreWorkspaceReadRepositories } from '../../../infrastructure/firestore/firestore-workspace-read-repositories';
import { getOutingReport, listOutings, manageOuting, pilotageDate, pilotageError, type Outing, type OutingCursor, type OutingReport } from '../../../infrastructure/firebase/outings-gateway';
import { readTask } from '../../../shared/async/read-task';
import { WORKSPACE_VISUAL_STATUS } from '../../../domain/workspace/status-ids';
import { STATUS_LABEL } from '../../../design/status';
import { DeviceSyncSummary } from './DeviceSyncSummary';

export function OutingsPage() {
  const { state } = useAuth();
  const member = state.status === 'active' ? state.session.member : null;
  const [zones, setZones] = useState<readonly Zone[]>([]);
  const [zoneId, setZoneId] = useState(() => new URLSearchParams(location.search).get('zone') ?? '');
  const [title, setTitle] = useState('');
  const [page, setPage] = useState<{ outings: Outing[]; nextCursor: OutingCursor } | null>(null);
  const [cursor, setCursor] = useState<OutingCursor>(null);
  const [previous, setPrevious] = useState<OutingCursor[]>([]);
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<OutingReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ outing: Outing; action: 'leave' | 'end' } | null>(null);
  const startId = useRef(crypto.randomUUID());
  const reportRequest = useRef(0);
  useEffect(() => {
    let active = true;
    void readTask(createFirestoreWorkspaceReadRepositories(getFirebaseClient().firestore, environment.workspaceId).zones.list()).then(values => {
      if (active) { setZones(values); setZoneId(current => values.some(zone => zone.id === current) ? current : values[0]?.id ?? ''); }
    }).catch(() => { if (active) setError('Les zones sont indisponibles. Recharge la page après reconnexion.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void listOutings(cursor).then(value => { if (active) setPage(value); })
      .catch(reason => { if (active) setError(pilotageError(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, version]);
  function refresh() { setLoading(true); setPage(null); setError(null); setVersion(value => value + 1); }
  async function showReport(id: string) {
    const request = ++reportRequest.current;
    setReport(null); setReportLoading(true); setReportError(null);
    try { const value = await getOutingReport(id); if (request === reportRequest.current) setReport(value); }
    catch (reason) { if (request === reportRequest.current) setReportError(pilotageError(reason)); }
    finally { if (request === reportRequest.current) setReportLoading(false); }
  }
  async function act(action: 'start' | 'join' | 'leave' | 'end', outingId: string) {
    setPending(true); setError(null);
    try {
      await manageOuting({ action, outingId, ...(action === 'start' ? { title, zoneId } : {}) });
      if (action === 'start') { startId.current = crypto.randomUUID(); setTitle(''); }
      setConfirmation(null); refresh(); await showReport(outingId);
    } catch (reason) { setError(pilotageError(reason)); }
    finally { setPending(false); }
  }
  function start(event: FormEvent) { event.preventDefault(); void act('start', startId.current); }
  if (!member) return null;
  const active = member.activeOuting;
  return <main className="admin-shell">
    <header className="member-header"><div><p className="eyebrow">Terrain / équipe</p><h1>Sorties terrain</h1></div>
      <nav className="pilotage-actions"><AppLink className="text-link" href={active ? `/?zone=${encodeURIComponent(active.zoneId)}` : '/'}>Carte terrain</AppLink>{member.role === 'admin' && <AppLink className="text-link" href="/admin">Pilotage</AppLink>}</nav></header>
    <p>Une sortie rassemble les passages de ses participants dans une zone. Démarrer, rejoindre et terminer nécessitent une connexion. Les passages restent enregistrables hors ligne après le démarrage confirmé.</p>
    {active && <section className="pilotage-section" aria-label="Ma sortie active"><h2>Ma sortie : {active.title}</h2><p>Les nouveaux passages dans cette zone seront rattachés à cette sortie, y compris hors ligne.</p><button className="secondary-action" disabled={reportLoading} onClick={() => void showReport(active.id)} type="button">Voir ma sortie</button></section>}
    <DeviceSyncSummary userId={member.id} />
    {error && <p role="alert" className="form-error">{error}</p>}
    {!active && <form className="admin-form" onSubmit={start}>
      <h2>Démarrer une sortie</h2><label>Nom de la sortie<input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} required /></label>
      <label>Zone de la sortie<select value={zoneId} onChange={event => setZoneId(event.target.value)} required>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
      <button className="primary-action" disabled={pending || !zoneId} type="submit">Démarrer la sortie</button>
    </form>}
    <section className="pilotage-section" aria-label="Historique des sorties">
      <h2>Sorties de l’équipe</h2><p>25 sorties par page, de la plus récente à la plus ancienne, toutes zones confondues.</p>
      <button className="secondary-action" disabled={loading || pending} onClick={refresh} type="button">Actualiser les sorties</button>
      {loading && <p role="status">Lecture des sorties…</p>}
      {page?.outings.length === 0 && <p>Démarre une sortie pour retrouver ici le travail de l’équipe.</p>}
      <ul className="pilotage-list">{page?.outings.map(outing => <li key={outing.id}>
        <h3>{outing.title}</h3><p>{outing.zoneName} · {outing.endedAt ? 'Terminée' : 'En cours'} · {pilotageDate(outing.startedAt)} · {Object.keys(outing.participants).length} participants</p>
        <div className="pilotage-actions"><button className="secondary-action" disabled={reportLoading} onClick={() => void showReport(outing.id)} type="button">Voir le bilan</button>
          {!outing.endedAt && !active && !outing.participants[member.id] && <button className="secondary-action" disabled={pending} onClick={() => void act('join', outing.id)} type="button">Rejoindre la sortie</button>}
          {!outing.endedAt && (outing.ownerId === member.id || member.role === 'admin') && <button className="secondary-action" disabled={pending} onClick={() => setConfirmation({ outing, action: 'end' })} type="button">Terminer la sortie</button>}
          {!outing.endedAt && active?.id === outing.id && outing.ownerId !== member.id && <button className="secondary-action" disabled={pending} onClick={() => setConfirmation({ outing, action: 'leave' })} type="button">Quitter la sortie</button>}
        </div>
      </li>)}</ul>
      <nav className="dashboard-pagination" aria-label="Pages des sorties">
        <button className="secondary-action" disabled={!previous.length || loading} onClick={() => { setCursor(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); setPage(null); setLoading(true); }} type="button">Sorties précédentes</button>
        <span>Page {previous.length + 1}</span>
        <button className="secondary-action" disabled={!page?.nextCursor || loading} onClick={() => { setPrevious([...previous, cursor]); setCursor(page!.nextCursor); setPage(null); setLoading(true); }} type="button">Sorties suivantes</button>
      </nav>
    </section>
    {reportLoading && <p role="status">Calcul du bilan depuis les passages reçus…</p>}
    {reportError && <p role="alert">Bilan indisponible. {reportError}</p>}
    {report && <section className="pilotage-section" aria-label="Bilan de sortie">
      <h2>{report.outing.title} — bilan</h2>
      <p>{report.outing.zoneName} · Début : {pilotageDate(report.outing.startedAt)} · Fin : {report.outing.endedAt ? pilotageDate(report.outing.endedAt) : 'En cours'}</p>
      <p data-testid="outing-summary"><strong>{report.visitCount} passages synchronisés · {report.doorCount} portes distinctes</strong></p>
      <p>Lecture serveur du {pilotageDate(report.readAt)}. Plusieurs passages sur une porte comptent plusieurs interventions, mais une seule porte. Ce bilan ne mesure pas la couverture de la zone.</p>
      <p>{report.lateSyncCount} passages reçus après clôture, inclus dans le bilan · {report.outsidePeriodCount} passages hors période, exclus du bilan et conservés dans l’historique.</p>
      <h3>Participants</h3><ul>{Object.entries(report.outing.participants).map(([id, participant]) => <li key={id}>{participant.displayName} : {report.byParticipant[id] ?? 0} passages · rejoint le {pilotageDate(participant.joinedAt)}{participant.leftAt ? ` · départ le ${pilotageDate(participant.leftAt)}` : ''}</li>)}</ul>
      <h3>Résultats des passages</h3><ul>{Object.entries(report.countsByStatus).map(([id, count]) => <li key={id}>{STATUS_LABEL[WORKSPACE_VISUAL_STATUS[id as keyof typeof WORKSPACE_VISUAL_STATUS]] ?? 'Statut inconnu'} : {count}</li>)}</ul>
      <button className="secondary-action" disabled={reportLoading} onClick={() => void showReport(report.outing.id)} type="button">Actualiser le bilan</button>
      <AppLink className="text-link" href={`/?zone=${encodeURIComponent(report.outing.zoneId)}`}>Ouvrir cette zone</AppLink>
    </section>}
    <Dialog open={Boolean(confirmation)} title={confirmation?.action === 'end' ? 'Terminer la sortie' : 'Quitter la sortie'} onClose={() => { if (!pending) setConfirmation(null); }}>
      <p>{confirmation?.outing.title}</p><p>Synchronise les passages de chaque appareil dès que possible. Ceux enregistrés avant la fin puis reçus plus tard compléteront le bilan. Les passages hors période seront signalés séparément.</p>
      {error && <p role="alert">{error}</p>}
      <div className="pilotage-actions"><button className="secondary-action" disabled={pending} onClick={() => setConfirmation(null)} type="button">Annuler</button><button className="primary-action" disabled={pending} onClick={() => confirmation && void act(confirmation.action, confirmation.outing.id)} type="button">Confirmer la fin</button></div>
    </Dialog>
  </main>;
}
