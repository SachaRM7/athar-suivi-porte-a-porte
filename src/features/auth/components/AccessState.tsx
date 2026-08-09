import type { ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { AuthBackdrop } from './AuthBackdrop';

export function AccessState({ title, message, canSignOut = false }: { title: string; message: string; canSignOut?: boolean }): ReactElement {
  const { signOut } = useAuth();
  return (
    <AuthBackdrop labelledBy="access-title">
      <p className="auth-microlabel">Athar · contrôle d’accès</p>
      <h1 id="access-title">{title}</h1>
      <p className="auth-lede">{message}</p>
      {canSignOut && <button className="auth-secondary" onClick={() => void signOut()} type="button">Se déconnecter</button>}
    </AuthBackdrop>
  );
}
