import { createContext, useContext } from 'react';
import type { AuthSessionSnapshot } from '../../infrastructure/firebase/auth-session-gateway';

export type ApplicationAuthState = AuthSessionSnapshot | { status: 'unconfigured' };

export type SignOutOptions = {
  /**
   * Confirmation explicite : sur un appareil non déclaré de confiance, les écritures pas
   * encore synchronisées seront effacées avec le reste. Sans elle, la déconnexion s'arrête
   * et rend le décompte de ce qui serait perdu.
   */
  discardUnsynced?: boolean;
};

export type SignOutOutcome =
  | { status: 'signed-out' }
  /** Rien n'a été fait : des écritures seraient perdues (`null` = file illisible, risque inconnu). */
  | { status: 'unsynced'; visits: number | null; profiles: number | null }
  /** Session fermée, mais une partie des données locales est restée sur l'appareil. */
  | { status: 'purge-incomplete'; failed: readonly string[] };

export type AuthContextValue = {
  state: ApplicationAuthState;
  signIn(identifier: string, password: string): Promise<void>;
  signOut(options?: SignOutOptions): Promise<SignOutOutcome>;
  /** Purge restée incomplète lors d'une déconnexion précédente, à reprendre. */
  localDataIssue: readonly string[] | null;
  retryLocalPurge(): Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
