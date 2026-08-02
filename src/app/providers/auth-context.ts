import { createContext, useContext } from 'react';
import type { AuthSessionSnapshot } from '../../infrastructure/firebase/auth-session-gateway';

export type ApplicationAuthState = AuthSessionSnapshot | { status: 'unconfigured' };

export type AuthContextValue = {
  state: ApplicationAuthState;
  signIn(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
