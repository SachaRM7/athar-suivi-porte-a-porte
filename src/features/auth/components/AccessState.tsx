import type { ReactElement } from 'react';
import { AppLink } from '../../../app/routes/router';
import { AuthBackdrop } from './AuthBackdrop';
import { useGuardedSignOut } from './GuardedSignOut';

/**
 * Un écran d'accès propose toujours une suite : réessayer quand la vérification a échoué,
 * revenir à la carte quand la page est réservée.
 */
export function AccessState({ title, message, canSignOut = false, next }: { title: string; message: string; canSignOut?: boolean; next?: 'retry' | 'map' }): ReactElement {
  const guardedSignOut = useGuardedSignOut();
  return (
    <AuthBackdrop labelledBy="access-title">
      <p className="auth-microlabel">Athar · contrôle d’accès</p>
      <h1 id="access-title">{title}</h1>
      <p className="auth-lede">{message}</p>
      {next === 'retry' && <button className="auth-primary" onClick={() => window.location.reload()} type="button">Réessayer</button>}
      {next === 'map' && <AppLink className="auth-primary" href="/">Retour à la carte</AppLink>}
      {canSignOut && <button className="auth-secondary" onClick={guardedSignOut.request} type="button">Se déconnecter</button>}
      {guardedSignOut.dialog}
    </AuthBackdrop>
  );
}
