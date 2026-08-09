import { useState, type FormEvent, type ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { environment } from '../../../app/config/environment';
import { signInErrorMessage } from '../../../domain/auth/sign-in-error';
import { Redirect } from '../../../app/routes/router';
import { AccessState } from './AccessState';

export function LoginPage(): ReactElement {
  const { state, signIn, registerMember, finalizeMemberRegistration } = useAuth();
  const allowLocalOnboarding = environment.firebase?.useEmulators === true;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  if (state.status === 'active') return <Redirect to="/" />;
  if (state.status === 'unconfigured') return <AccessState title="Configuration requise" message="La configuration Firebase de cet environnement est absente. Renseignez les variables VITE_FIREBASE_* avant d'ouvrir une session." />;
  if (state.status === 'loading') return <AccessState title="Verification en cours" message="Athar verifie la session et l'acces au workspace." />;
  if (state.status === 'inactive') return <AccessState canSignOut title="Acces suspendu" message="Ce compte existe, mais son acces au workspace est inactif." />;
  if (state.status === 'unregistered' && !allowLocalOnboarding) return <AccessState canSignOut title="Acces non active" message="Ce compte n'a pas de profil membre. Demandez a un administrateur de creer ou reactiver l'acces." />;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await signIn(String(data.get('username') ?? ''), String(data.get('password') ?? ''));
    } catch (cause) {
      setError(signInErrorMessage(cause, { useEmulators: environment.firebase?.useEmulators ?? false }));
    } finally {
      setPending(false);
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await registerMember(String(data.get('username') ?? ''), String(data.get('displayName') ?? ''), String(data.get('password') ?? ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Creation du compte impossible.');
    } finally {
      setPending(false);
    }
  }

  async function retryProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await finalizeMemberRegistration(String(data.get('username') ?? ''), String(data.get('displayName') ?? ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Finalisation du profil impossible.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-intro" aria-labelledby="login-title">
        <p className="brand-word">ATHAR</p>
        <div>
          <p className="eyebrow">Coordination privee / Toulouse</p>
          <h1 id="login-title">Retrouver le terrain.</h1>
          <p>Connexion reservee aux membres autorises du workspace.</p>
        </div>
      </section>
      <section className="login-form-panel">
        {state.status === 'unregistered' ? <form className="auth-form" onSubmit={(event) => void retryProfile(event)}>
          <div>
            <p className="eyebrow">Compte a finaliser</p>
            <h2>Finaliser l acces</h2>
          </div>
          <p>Votre authentification a reussi, mais votre profil membre n a pas encore ete cree. Reessayez sans recreer de compte.</p>
          <label>
            Identifiant
            <input autoComplete="username" defaultValue={state.user.email?.replace('@auth.athar.invalid', '') ?? ''} name="username" pattern={String.raw`[A-Za-z0-9._\-]{3,32}`} required />
          </label>
          <label>
            Nom affiche
            <input autoComplete="name" defaultValue={state.user.displayName ?? ''} maxLength={80} name="displayName" required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action" disabled={pending} type="submit">{pending ? 'Finalisation...' : 'Reessayer la finalisation'}</button>
        </form> : <form className="auth-form" onSubmit={(event) => void (registering ? submitRegistration(event) : submit(event))}>
          <div>
            <p className="eyebrow">Acces membre</p>
            <h2>{registering ? 'Creer un compte' : 'Connexion'}</h2>
          </div>
          {registering && <label>
            Nom affiche
            <input autoComplete="name" maxLength={80} name="displayName" required />
          </label>}
          <label>
            Identifiant
            <input autoComplete="username" name="username" pattern={String.raw`[A-Za-z0-9._\-]{3,32}`} required />
          </label>
          <label>
            Mot de passe
            <input autoComplete={registering ? 'new-password' : 'current-password'} minLength={6} name="password" required type="password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action" disabled={pending} type="submit">{pending ? (registering ? 'Creation...' : 'Connexion...') : (registering ? 'Creer mon compte' : 'Se connecter')}</button>
          {allowLocalOnboarding
            ? <button className="text-button" onClick={() => { setRegistering((value) => !value); setError(null); }} type="button">{registering ? 'J ai deja un compte' : 'Creer un compte'}</button>
            : <p className="auth-help">Les acces sont crees par un administrateur.</p>}
        </form>}
      </section>
    </main>
  );
}
