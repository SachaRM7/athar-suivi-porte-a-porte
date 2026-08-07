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

  const registerMember = useCallback(async (username: string, displayName: string, password: string) => {
    const [clientModule, onboardingModule] = await Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/onboarding-gateway')
    ]);
    const client = clientModule.getFirebaseClient();
    await onboardingModule.registerMemberWithPassword(client.auth, client.functions, { username, displayName, password });
  }, []);

  const finalizeMemberRegistration = useCallback(async (username: string, displayName: string) => {
    const [clientModule, onboardingModule] = await Promise.all([
      import('../../infrastructure/firebase/client'),
      import('../../infrastructure/firebase/onboarding-gateway')
    ]);
    await onboardingModule.finalizeMemberRegistration(clientModule.getFirebaseClient().functions, { username, displayName });
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

  const value = useMemo(() => ({ state, signIn, registerMember, finalizeMemberRegistration, signOut }), [state, signIn, registerMember, finalizeMemberRegistration, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
