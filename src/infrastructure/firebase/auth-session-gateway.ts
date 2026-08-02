import { onAuthStateChanged, signOut, type Auth, type User } from 'firebase/auth';
import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import type { WorkspaceMember } from '../../domain/workspace/models';
import { fromFirestoreMember } from '../firestore/workspace-codecs';

export type AuthSession = { user: User; member: WorkspaceMember };

export type AuthSessionSnapshot =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'active'; session: AuthSession }
  | { status: 'inactive'; user: User }
  | { status: 'error'; message: string };

export function observeAuthSession(
  auth: Auth,
  firestore: Firestore,
  workspaceId: string,
  observer: (snapshot: AuthSessionSnapshot) => void
): Unsubscribe {
  let unsubscribeMember: Unsubscribe | null = null;
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    unsubscribeMember?.();
    unsubscribeMember = null;
    if (!user) {
      observer({ status: 'anonymous' });
      return;
    }
    unsubscribeMember = onSnapshot(
      doc(firestore, `workspaces/${workspaceId}/members/${user.uid}`),
      (snapshot) => {
        if (!snapshot.exists()) {
          observer({ status: 'inactive', user });
          return;
        }
        try {
          const member = fromFirestoreMember(snapshot.id, snapshot.data());
          observer(member.active ? { status: 'active', session: { user, member } } : { status: 'inactive', user });
        } catch (error) {
          observer({ status: 'error', message: error instanceof Error ? error.message : 'Invalid member profile.' });
        }
      },
      () => observer({ status: 'error', message: 'Unable to verify workspace access.' })
    );
  }, () => observer({ status: 'error', message: 'Unable to observe authentication.' }));

  return () => {
    unsubscribeMember?.();
    unsubscribeAuth();
  };
}

export async function closeFirebaseSession(auth: Auth): Promise<void> {
  await signOut(auth);
}
