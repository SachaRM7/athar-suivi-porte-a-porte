import type { ReactElement } from 'react';
import { AuthBackdrop } from './AuthBackdrop';
import { useGuardedSignOut } from './GuardedSignOut';

export function AccessState({ title, message, canSignOut = false }: { title: string; message: string; canSignOut?: boolean }): ReactElement {
  const guardedSignOut = useGuardedSignOut();
  return (
    <AuthBackdrop labelledBy="access-title">
      <p className="auth-microlabel">Athar · contrôle d’accès</p>
      <h1 id="access-title">{title}</h1>
      <p className="auth-lede">{message}</p>
      {canSignOut && <button className="auth-secondary" onClick={guardedSignOut.request} type="button">Se déconnecter</button>}
      {guardedSignOut.dialog}
    </AuthBackdrop>
  );
}
