import { useState, type FormEvent, type ReactElement } from 'react';
import { useAuth } from '../../../app/providers/auth-context';
import { Redirect } from '../../../app/routes/router';
import { AccessState } from './AccessState';

export function LoginPage(): ReactElement {
  const { state, signIn } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'active') return <Redirect to="/" />;
  if (state.status === 'unconfigured') return <AccessState title="Configuration requise" message="La configuration Firebase de cet environnement est absente. Renseignez les variables VITE_FIREBASE_* avant d'ouvrir une session." />;
  if (state.status === 'loading') return <AccessState title="Verification en cours" message="Athar verifie la session et l'acces au workspace." />;
  if (state.status === 'inactive') return <AccessState canSignOut title="Acces suspendu" message="Ce compte existe, mais son acces au workspace est inactif." />;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await signIn(String(data.get('username') ?? ''), String(data.get('password') ?? ''));
    } catch {
      setError('Identifiant ou mot de passe incorrect.');
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
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <div>
            <p className="eyebrow">Acces membre</p>
            <h2>Connexion</h2>
          </div>
          <label>
            Identifiant
            <input autoComplete="username" name="username" pattern="[A-Za-z0-9._-]{3,32}" required />
          </label>
          <label>
            Mot de passe
            <input autoComplete="current-password" minLength={6} name="password" required type="password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action" disabled={pending} type="submit">{pending ? 'Connexion...' : 'Se connecter'}</button>
        </form>
      </section>
    </main>
  );
}
