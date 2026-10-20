import { useEffect, useState } from 'react';
import { IndexedDbDoorMarkerOutbox, IndexedDbOutbox } from '../../../infrastructure/outbox/indexeddb-outbox';
import { AppLink } from '../../../app/routes/router';

/** Ces files sont locales : ne jamais les présenter comme un inventaire de l'équipe. */
export function DeviceSyncSummary({ userId }: { userId: string }) {
  const [counts, setCounts] = useState<{ pending: number; conflicts: number; rejected: number; profiles: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [entries, profiles] = await Promise.all([new IndexedDbOutbox(userId).all(), new IndexedDbDoorMarkerOutbox(userId).pending()]);
        if (active) { setCounts({ pending: entries.filter(e => e.state === 'pending').length, conflicts: entries.filter(e => e.state === 'conflict').length, rejected: entries.filter(e => e.state === 'rejected').length, profiles: profiles.length }); setFailed(false); }
      } catch { if (active) { setCounts(null); setFailed(true); } }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [userId]);
  return <aside className="pilotage-section" aria-label="Synchronisation de cet appareil">
    <h2>Sur cet appareil, pour ton compte</h2>
    {counts ? <p>{counts.pending} passages en attente · {counts.conflicts} conflits · {counts.rejected} refus · {counts.profiles} profils en attente</p> : <p role="status">{failed ? 'Stockage local illisible : compteurs indisponibles.' : 'Lecture de la file locale…'}</p>}
    <p>Les files des autres appareils ne sont pas visibles ici. Les bilans partagés comptent uniquement les passages reçus par le serveur.</p>
    <AppLink className="text-link" href="/">Synchroniser ou résoudre sur la carte</AppLink>
  </aside>;
}
