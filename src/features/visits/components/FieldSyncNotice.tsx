import type { FieldVisitSync } from '../model/use-field-visit-sync';

/** Visible in the zone as well as in a building: closing a sheet never hides a pending write. */
export function FieldSyncNotice({ sync, onResolve }: { sync: FieldVisitSync; onResolve(): void }) {
  const symbol = sync.status.phase === 'synced' ? (sync.online ? '✓' : '◷') : sync.status.phase === 'pending' || sync.status.phase === 'deferred' ? '◷' : '!';
  return <section className="field-sync-notice" aria-label="Sauvegarde des passages" data-phase={sync.status.phase}>
    <p role="status" title={sync.status.detail ?? undefined}><span aria-hidden="true">{symbol} </span><strong>{sync.status.phase === 'synced' && sync.online ? 'Synchronisé' : sync.status.label}</strong></p>
    {sync.status.detail && sync.status.phase !== 'synced' && <small>{sync.status.detail}</small>}
    {sync.status.phase === 'attention' || sync.status.phase === 'save-error' ? <button className="text-button" onClick={onResolve} type="button">{sync.status.phase === 'save-error' ? 'Reprendre la saisie' : 'Ouvrir le bâtiment concerné'}</button>
      : sync.status.phase !== 'synced' && sync.status.phase !== 'checking' && <button className="text-button" disabled={!sync.online || sync.syncing} onClick={() => void sync.synchronize()} type="button">{sync.syncing ? 'Envoi en cours…' : 'Synchroniser'}</button>}
  </section>;
}
