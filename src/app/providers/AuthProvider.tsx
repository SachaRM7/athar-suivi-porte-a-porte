import { useCallback, useEffect, useMemo, useState, type PropsWithChildren, type ReactElement } from 'react';
import { environment } from '../config/environment';
import { planSignOut } from './sign-out-policy';
import { AuthContext, type ApplicationAuthState, type SignOutOptions, type SignOutOutcome } from './auth-context';

async function loadPurgeModules() {
  const [clientModule, deviceStorage] = await Promise.all([
    import('../../infrastructure/firebase/client'),
    import('../../infrastructure/offline/device-storage')
  ]);
  return { clientModule, deviceStorage };
}

/** Purge de l'appareil non approuvé, cache Firestore compris. Le rapport dit ce qui a échoué. */
async function purgeDevice(authorId: string) {
  const { clientModule, deviceStorage } = await loadPurgeModules();
  return deviceStorage.purgeUntrustedDevice(authorId, [
    { step: 'cache Firestore', run: () => clientModule.clearFirebaseLocalCache() }
  ]);
}

export function AuthProvider({ children }: PropsWithChildren): ReactElement {
  const [state, setState] = useState<ApplicationAuthState>(environment.firebase ? { status: 'loading' } : { status: 'unconfigured' });
  const [localDataIssue, setLocalDataIssue] = useState<readonly string[] | null>(null);

  useEffect(() => {
    if (!environment.firebase) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/auth-session-gateway')
    ]).then(([clientModule, sessionModule]) => {
      if (!active) return;
      const client = clientModule.getFirebaseClient();
      unsubscribe = sessionModule.observeAuthSession(client.auth, client.firestore, environment.workspaceId, setState);
    }).catch(() => { if (active) setState({ status: 'error', message: 'Unable to initialize Firebase.' }); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  /**
   * Une purge restée incomplète est reprise au démarrage, mais seulement sans session :
   * on n'efface jamais ce qu'un utilisateur reconnecté vient de saisir.
   */
  useEffect(() => {
    if (state.status !== 'anonymous' && state.status !== 'unconfigured') return;
    let active = true;
    void import('../../infrastructure/offline/device-storage').then(async (deviceStorage) => {
      const uid = deviceStorage.pendingPurge();
      if (!uid) return;
      const report = await purgeDevice(uid);
      if (active) setLocalDataIssue(report.complete ? null : report.failed);
    }).catch(() => { if (active) setLocalDataIssue(['données locales']); });
    return () => { active = false; };
  }, [state.status]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const [clientModule, authModule] = await Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/username-auth-gateway')
    ]);
    await authModule.signInToFirebaseWithIdentifier(clientModule.getFirebaseClient().auth, identifier, password);
  }, []);

  const signOut = useCallback(async (options: SignOutOptions = {}): Promise<SignOutOutcome> => {
    const [clientModule, sessionModule, deviceStorage] = await Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/auth-session-gateway'),
      import('../../infrastructure/offline/device-storage')
    ]);
    const firebaseClient = clientModule.getFirebaseClient();
    const authorId = state.status === 'active'
      ? state.session.member.id
      : state.status === 'inactive' || state.status === 'unregistered'
        ? state.user.uid
        : firebaseClient.auth.currentUser?.uid;
    const trusted = deviceStorage.isTrustedDevice();
    // Le décompte n'est lu que s'il peut changer la décision : appareil non approuvé, sans confirmation.
    const unsynced = authorId && !trusted && !options.discardUnsynced ? await deviceStorage.unsyncedLocalWrites(authorId) : null;
    const plan = planSignOut({ authorId, trusted, discardUnsynced: options.discardUnsynced === true, unsynced });
    if (plan.action === 'warn') return { status: 'unsynced', visits: plan.visits, profiles: plan.profiles };
    const purge = plan.purge;
    await sessionModule.closeFirebaseSession(firebaseClient.auth);
    if (!purge || !authorId) return { status: 'signed-out' };
    const report = await purgeDevice(authorId);
    if (!report.complete) {
      setLocalDataIssue(report.failed);
      return { status: 'purge-incomplete', failed: report.failed };
    }
    window.location.reload();
    return { status: 'signed-out' };
  }, [state]);

  const retryLocalPurge = useCallback(async () => {
    const deviceStorage = await import('../../infrastructure/offline/device-storage');
    const uid = deviceStorage.pendingPurge();
    if (!uid) {
      setLocalDataIssue(null);
      return;
    }
    const report = await purgeDevice(uid);
    setLocalDataIssue(report.complete ? null : report.failed);
    if (report.complete) window.location.reload();
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, localDataIssue, retryLocalPurge }),
    [state, signIn, signOut, localDataIssue, retryLocalPurge]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
