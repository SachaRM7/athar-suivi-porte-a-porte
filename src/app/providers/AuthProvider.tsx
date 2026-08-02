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

  const signIn = useCallback(async (username: string, password: string) => {
    const [clientModule, authModule] = await Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/username-auth-gateway')
    ]);
    await authModule.signInToFirebaseWithUsername(clientModule.getFirebaseClient().auth, username, password);
  }, []);

  const signOut = useCallback(async () => {
    const [clientModule, sessionModule] = await Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/auth-session-gateway')
    ]);
    await sessionModule.closeFirebaseSession(clientModule.getFirebaseClient().auth);
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
