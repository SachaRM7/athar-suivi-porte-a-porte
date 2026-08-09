import { useCallback, useEffect, useMemo, useState, type PropsWithChildren, type ReactElement } from 'react';
import { environment } from '../config/environment';
import { AuthContext, type ApplicationAuthState } from './auth-context';

export function AuthProvider({ children }: PropsWithChildren): ReactElement {
  const [state, setState] = useState<ApplicationAuthState>(environment.firebase ? { status: 'loading' } : { status: 'unconfigured' });

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

  const signIn = useCallback(async (identifier: string, password: string) => {
    const [clientModule, authModule] = await Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/username-auth-gateway')
    ]);
    await authModule.signInToFirebaseWithIdentifier(clientModule.getFirebaseClient().auth, identifier, password);
  }, []);

  const signOut = useCallback(async () => {
    const [clientModule, sessionModule, deviceStorage] = await Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/auth-session-gateway'),
      import('../../infrastructure/offline/device-storage')
    ]);
    const firebaseClient = clientModule.getFirebaseClient();
    const authorId = state.status === 'active'
      ? state.session.member.id
      : state.status === 'inactive'
        ? state.user.uid
        : firebaseClient.auth.currentUser?.uid;
    const purge = Boolean(authorId) && !deviceStorage.isTrustedDevice();
    await sessionModule.closeFirebaseSession(firebaseClient.auth);
    if (purge && authorId) {
      await deviceStorage.purgeUntrustedDevice(authorId);
      await clientModule.clearFirebaseLocalCache();
      window.location.reload();
    }
  }, [state]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
