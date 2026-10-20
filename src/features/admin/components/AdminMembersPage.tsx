import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { environment } from '../../../app/config/environment';
import { AppLink } from '../../../app/routes/router';
import { useAuth } from '../../../app/providers/auth-context';
import { Dialog } from '../../../design/components/Dialog';
import { createMemberWithFunction, listMembers, manageMember, type ManagedMember, type MemberAction } from '../../../infrastructure/firebase/admin-members-gateway';
import { getFirebaseClient } from '../../../infrastructure/firebase/client';
import { pilotageDate, pilotageError } from '../../../infrastructure/firebase/outings-gateway';

const labels: Record<MemberAction, string> = { suspend: 'Suspendre l’accès', reactivate: 'Réactiver l’accès', promote: 'Nommer administrateur', demote: 'Passer en membre', 'reset-password': 'Réinitialiser le mot de passe' };

export function AdminMembersPage(): ReactElement {
  const { state } = useAuth();
  const uid = state.status === 'active' ? state.session.member.id : '';
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<{ members: ManagedMember[]; nextCursor: string | null } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [version, setVersion] = useState(0);
  const [edit, setEdit] = useState<{ member: ManagedMember; action: MemberAction } | null>(null);
  const [password, setPassword] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void listMembers(getFirebaseClient().functions, environment.workspaceId, cursor).then(data => {
      if (active) { setPage(data); setError(null); }
    }).catch(reason => { if (active) setError(pilotageError(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, version]);
  function refresh() { setLoading(true); setPage(null); setVersion(value => value + 1); }
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true); setResult(null); setError(null);
    try {
      const created = await createMemberWithFunction(getFirebaseClient().functions, {
        workspaceId: environment.workspaceId, username: String(data.get('username') ?? ''),
        displayName: String(data.get('displayName') ?? ''), temporaryPassword: String(data.get('temporaryPassword') ?? '')
      });
      setResult(`Compte ${created.username} créé. Transmets le mot de passe temporaire à son titulaire.`);
      form.reset(); refresh();
    } catch (reason) { setError(pilotageError(reason)); }
    finally { setPending(false); }
  }
  async function confirm() {
    if (!edit) return;
    setPending(true); setEditError(null);
    try {
      await manageMember(getFirebaseClient().functions, { workspaceId: environment.workspaceId, targetId: edit.member.id, action: edit.action,
        ...(edit.action === 'reset-password' ? { temporaryPassword: password } : {}) });
      setResult(`${labels[edit.action]} : modification confirmée pour ${edit.member.displayName}.`);
      setPassword(''); setEdit(null); refresh();
    } catch (reason) { setEditError(pilotageError(reason)); }
    finally { setPending(false); }
  }
  return <main className="admin-shell">
    <header className="member-header"><div><p className="eyebrow">Administration / membres</p><h1>Gérer les membres</h1></div><AppLink className="text-link" href="/admin">Pilotage</AppLink></header>
    {result && <p role="status">{result}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <section aria-label="Liste des membres" className="pilotage-section">
      <button className="secondary-action" disabled={loading || pending} onClick={refresh} type="button">Actualiser les membres</button>
      {loading && <p role="status">Lecture des membres…</p>}
      {page?.members.length === 0 && <p>Crée le premier accès ci-dessous.</p>}
      <ul className="pilotage-list">{page?.members.map(member => <li key={member.id}>
        <h2>{member.displayName}</h2><p>{member.username} · {member.role === 'admin' ? 'Administrateur' : 'Membre'} · {member.active ? 'Actif' : 'Suspendu'}</p>
        <p>Dernière connexion : {pilotageDate(member.lastSignInAt)} · Dernier passage reçu : {pilotageDate(member.lastVisitAt)}</p>
        {member.accountState !== (member.active ? 'enabled' : 'disabled') && <p role="status">Compte d’authentification {member.accountState === 'missing' ? 'introuvable' : 'à réconcilier'}. Réessaie l’action souhaitée.</p>}
        {member.id === uid ? <p>Ton accès se modifie depuis le compte d’un autre administrateur.</p> : <div className="pilotage-actions">
          {([member.active ? 'suspend' : 'reactivate', member.role === 'admin' ? 'demote' : 'promote', 'reset-password'] as MemberAction[]).map(action =>
            <button className="secondary-action" disabled={pending} key={action} onClick={() => { setEdit({ member, action }); setPassword(''); setEditError(null); }} type="button">{labels[action]}</button>)}
        </div>}
      </li>)}</ul>
      <nav className="dashboard-pagination" aria-label="Pages des membres">
        <button className="secondary-action" disabled={!previous.length || loading} onClick={() => { setCursor(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); setPage(null); setLoading(true); }} type="button">Membres précédents</button>
        <span>Page {previous.length + 1}</span>
        <button className="secondary-action" disabled={!page?.nextCursor || loading} onClick={() => { setPrevious([...previous, cursor]); setCursor(page!.nextCursor); setPage(null); setLoading(true); }} type="button">Membres suivants</button>
      </nav>
    </section>
    <h2>Créer un accès</h2>
    <form className="admin-form" onSubmit={event => void submit(event)}>
      <label>Identifiant<input autoComplete="off" name="username" pattern="[a-z0-9][a-z0-9._-]{2,31}" required /></label>
      <label>Nom affiché<input autoComplete="off" maxLength={80} name="displayName" required /></label>
      <label>Mot de passe temporaire<input autoComplete="new-password" minLength={12} maxLength={128} name="temporaryPassword" required type="password" /></label>
      <button className="primary-action" disabled={pending} type="submit">{pending ? 'Enregistrement…' : 'Créer le membre'}</button>
    </form>
    <Dialog open={Boolean(edit)} title={edit ? labels[edit.action] : ''} onClose={() => { if (!pending) { setEdit(null); setPassword(''); } }}>
      <p>{edit?.member.displayName} ({edit?.member.username})</p>
      {edit?.action === 'suspend' && <p>L’accès partagé sera retiré immédiatement. Les passages déjà enregistrés restent dans l’historique.</p>}
      {edit?.action === 'promote' && <p>Ce membre pourra gérer les accès, les zones et la clôture des sorties.</p>}
      {edit?.action === 'reset-password' && <label>Nouveau mot de passe temporaire<input autoComplete="new-password" type="password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>}
      {editError && <p role="alert">{editError}</p>}
      <div className="pilotage-actions"><button className="secondary-action" disabled={pending} onClick={() => { setEdit(null); setPassword(''); }} type="button">Annuler</button>
        <button className="primary-action" disabled={pending || (edit?.action === 'reset-password' && password.length < 12)} onClick={() => void confirm()} type="button">{pending ? 'Enregistrement…' : 'Confirmer la modification'}</button></div>
    </Dialog>
  </main>;
}
