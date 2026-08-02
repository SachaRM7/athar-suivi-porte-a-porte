import type { ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { AppLink } from '../../../app/routes/router';

export function AccessState({ title, message, canSignOut = false }: { title: string; message: string; canSignOut?: boolean }): ReactElement {
  const { signOut } = useAuth();
  return (
    <main className="access-shell">
      <section className="access-panel" aria-labelledby="access-title">
        <p className="eyebrow">Athar / controle d'acces</p>
        <h1 id="access-title">{title}</h1>
        <p className="access-copy">{message}</p>
        <div className="access-actions">
          {canSignOut && <button className="primary-action" onClick={() => void signOut()} type="button">Se deconnecter</button>}
          <AppLink className="text-link" href="/technical-lab">Ouvrir le laboratoire technique</AppLink>
        </div>
      </section>
    </main>
  );
}
