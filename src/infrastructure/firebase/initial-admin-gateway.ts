import { httpsCallable, type Functions } from 'firebase/functions';
import type { User } from 'firebase/auth';

export async function claimInitialAdminWithFunction(functions: Functions, user: User | null, code: string): Promise<void> {
  if (!user) throw new Error('Connectez-vous avant d activer l administration.');
  const callable = httpsCallable<{ code: string }, { role: 'admin' }>(functions, 'claimInitialAdmin');
  await callable({ code });
  await user.getIdToken(true);
}
