import { useEffect, useState, type CSSProperties, type FormEvent, type ReactElement } from 'react';
import { environment } from '../../../app/config/environment';
import { useAuth } from '../../../app/providers/auth-context';
import { navigate } from '../../../app/routes/navigation';
import { Redirect } from '../../../app/routes/router';
import { signInErrorMessage } from '../../../domain/auth/sign-in-error';
import type { Zone, ZoneStats } from '../../../domain/workspace/models';
import { AccessState } from './AccessState';
import { AuthBackdrop } from './AuthBackdrop';

type ZoneEntry = { zone: Zone; stats: ZoneStats | null };

function routeForZone(zoneId: string | null): string {
  return zoneId ? `/?zone=${encodeURIComponent(zoneId)}` : '/';
}

function progressFor(entry: ZoneEntry): number {
  if (!entry.stats || entry.stats.doorCount === 0) return 0;
  const todo = entry.stats.countsByStatus.todo ?? entry.stats.countsByStatus.unvisited ?? 0;
  return Math.round(((entry.stats.doorCount - todo) / entry.stats.doorCount) * 100);
}

function zoneDetail(entry: ZoneEntry): string {
  if (!entry.stats || entry.stats.doorCount === 0) return 'Zone prête pour la prochaine sortie';
  const todo = entry.stats.countsByStatus.todo ?? entry.stats.countsByStatus.unvisited ?? 0;
  return `${entry.stats.doorCount} portes · ${todo} pas encore faites`;
}

function ActiveEntry(): ReactElement {
  const { state } = useAuth();
  const [entries, setEntries] = useState<readonly ZoneEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      import('../../../infrastructure/firebase/client'),
      import('../../../infrastructure/firestore/firestore-workspace-read-repositories')
    ]).then(async ([clientModule, repositoriesModule]) => {
      const client = clientModule.getFirebaseClient();
      const repositories = repositoriesModule.createFirestoreWorkspaceReadRepositories(client.firestore, environment.workspaceId, { source: 'server-first' });
      const zones = await repositories.zones.list();
      const next = await Promise.all(zones.map(async (zone) => ({
        zone,
        stats: await repositories.zones.getStats(zone.id).catch(() => null)
      })));
      if (!active) return;
      setEntries(next);
      setSelectedId(next[0]?.zone.id ?? null);
    }).catch(() => {
      if (active) setEntries([]);
    });
    return () => { active = false; };
  }, []);

  if (entries === null) {
    return <AccessState title="Préparation de la zone" message="Athar retrouve les zones disponibles pour cette sortie." />;
  }
  if (entries.length <= 1) return <Redirect to={routeForZone(entries[0]?.zone.id ?? null)} />;
  if (state.status !== 'active') return <Redirect to="/login" />;

  const selected = entries.find((entry) => entry.zone.id === selectedId) ?? entries[0];
  return (
    <AuthBackdrop labelledBy="zone-choice-title">
      <p className="auth-microlabel">Première ouverture · {state.session.member.displayName}</p>
      <h1 id="zone-choice-title">Choisis la zone de la sortie.</h1>
      <p className="auth-lede">Tu pourras en changer à tout moment depuis la carte. Ce choix organise le terrain, il ne limite pas ton accès.</p>
      <div className="auth-zone-list" role="radiogroup" aria-label="Zone de la sortie">
        {entries.map((entry) => {
          const progress = progressFor(entry);
          return (
            <button
              aria-checked={entry.zone.id === selected.zone.id}
              className="auth-zone"
              key={entry.zone.id}
              onClick={() => setSelectedId(entry.zone.id)}
              role="radio"
              type="button"
            >
              <span className="auth-zone-ring" style={{ '--zone-progress': `${progress * 3.6}deg` } as CSSProperties}><b>{progress}</b></span>
              <span><strong>{entry.zone.name}</strong><small>{zoneDetail(entry)}</small></span>
              <i aria-hidden="true">›</i>
            </button>
          );
        })}
      </div>
      <button className="auth-primary" onClick={() => navigate(routeForZone(selected.zone.id))} type="button">Entrer dans {selected.zone.name}</button>
      <p className="auth-footnote">Une zone manque ? Demande à ton coordinateur de la préparer dans Athar.</p>
    </AuthBackdrop>
  );
}

function NoAccess({ signedIn = false }: { signedIn?: boolean }): ReactElement {
  const { signOut } = useAuth();
  const [returning, setReturning] = useState(false);
  if (returning && !signedIn) return <LoginForm />;
  return (
    <AuthBackdrop labelledBy="no-access-title">
      <p className="auth-microlabel">Accès sur invitation</p>
      <h1 id="no-access-title">C’est ton coordinateur qui t’ouvre l’accès.</h1>
      <p className="auth-lede">Athar ne propose pas d’inscription libre : chaque frère est ajouté au workspace par la personne qui le coordonne.</p>
      <div className="auth-information">
        <span aria-hidden="true">i</span>
        <p>Ce fonctionnement protège les adresses visitées, les notes de passage et les foyers signalés. <strong>Elles restent entre les membres invités.</strong></p>
      </div>
      <ol className="auth-steps">
        <li><span>1</span><p>Donne ton <strong>adresse e-mail ou identifiant</strong> au coordinateur.</p></li>
        <li><span>2</span><p>Il crée ton accès depuis son espace d’administration.</p></li>
        <li><span>3</span><p>Il te transmet ton accès initial de façon privée.</p></li>
      </ol>
      {signedIn
        ? <button className="auth-secondary" onClick={() => void signOut()} type="button">Se connecter avec un autre compte</button>
        : <button className="auth-secondary" onClick={() => setReturning(true)} type="button">Revenir à la connexion</button>}
    </AuthBackdrop>
  );
}

function LoginForm(): ReactElement {
  const { signIn } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNoAccess, setShowNoAccess] = useState(false);
  const [recoveryVisible, setRecoveryVisible] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await signIn(String(data.get('identifier') ?? ''), String(data.get('password') ?? ''));
    } catch (cause) {
      setError(signInErrorMessage(cause, { useEmulators: environment.firebase?.useEmulators ?? false }));
    } finally {
      setPending(false);
    }
  }

  if (showNoAccess) return <NoAccess />;
  return (
    <AuthBackdrop labelledBy="login-title">
      <p className="auth-microlabel">Porte-à-porte · Toulouse</p>
      <h1 id="login-title">Reprendre là où la zone s’est arrêtée.</h1>
      <p className="auth-lede">L’accès est réservé aux frères ajoutés par un coordinateur.</p>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span className="auth-microlabel">Adresse e-mail ou identifiant</span>
          <span className="auth-input"><input autoComplete="username" name="identifier" placeholder="sacharbone" required /></span>
        </label>
        <label>
          <span className="auth-microlabel">Mot de passe</span>
          <span className="auth-input">
            <input autoComplete="current-password" minLength={6} name="password" placeholder="••••••••••" required type={showPassword ? 'text' : 'password'} />
            <button onClick={() => setShowPassword((visible) => !visible)} type="button">{showPassword ? 'Masquer' : 'Afficher'}</button>
          </span>
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {recoveryVisible && <p className="auth-notice" role="status">Demande à ton coordinateur de réinitialiser ton accès. Ce message ne confirme jamais si un compte existe.</p>}
        <button className="auth-primary" disabled={pending} type="submit">{pending ? 'Connexion en cours…' : 'Se connecter'}</button>
      </form>
      <div className="auth-link-row">
        <button onClick={() => setShowNoAccess(true)} type="button">Je n’ai pas encore d’accès</button>
        <button onClick={() => setRecoveryVisible(true)} type="button">Mot de passe oublié</button>
      </div>
      <p className="auth-footnote">Les données de terrain restent dans le workspace Athar. Rien n’est partagé en dehors.</p>
    </AuthBackdrop>
  );
}

export function LoginPage(): ReactElement {
  const { state } = useAuth();
  if (state.status === 'active') return <ActiveEntry />;
  if (state.status === 'unconfigured') return <AccessState title="Configuration requise" message="La configuration Firebase de cet environnement est absente." />;
  if (state.status === 'loading') return <AccessState title="Vérification en cours" message="Athar vérifie la session et l’accès au workspace." />;
  if (state.status === 'inactive') return <AccessState canSignOut title="Accès suspendu" message="Ce compte existe, mais son accès au workspace est inactif. Demande sa réactivation à ton coordinateur." />;
  if (state.status === 'unregistered') return <NoAccess signedIn />;
  if (state.status === 'error') return <AccessState canSignOut title="Vérification impossible" message="Athar ne peut pas vérifier cet accès. Vérifie la connexion, puis réessaie." />;
  return <LoginForm />;
}
