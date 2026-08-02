import type { ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { AppLink } from '../../../app/routes/router';

export function MemberHome(): ReactElement {
  const { state, signOut } = useAuth();
  if (state.status !== 'active') throw new Error('MemberHome requires an active session.');
  return (
    <main className="member-shell">
      <header className="member-header">
        <div>
          <p className="eyebrow">Athar / acces verifie</p>
          <h1>Bonjour {state.session.member.displayName}</h1>
        </div>
        <button className="secondary-action" onClick={() => void signOut()} type="button">Se deconnecter</button>
      </header>
      <section className="foundation-band">
        <div>
          <p className="eyebrow">Etape 5</p>
          <h2>Session active</h2>
        </div>
        <dl className="identity-list">
          <div><dt>Identifiant</dt><dd>{state.session.member.username}</dd></div>
          <div><dt>Role</dt><dd>{state.session.member.role === 'admin' ? 'Administrateur' : 'Membre'}</dd></div>
          <div><dt>Workspace</dt><dd>main</dd></div>
        </dl>
      </section>
      <nav className="member-links" aria-label="Routes disponibles">
        {state.session.member.role === 'admin' && <AppLink className="primary-action link-action" href="/admin/members">Gerer les membres</AppLink>}
        <AppLink className="text-link" href="/technical-lab">Laboratoire technique</AppLink>
      </nav>
    </main>
  );
}
