import { signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { signInWithIdentifier } from '../../domain/auth/username';

/** Client-side sign-in only. Account creation remains a privileged backend action. */
export async function signInToFirebaseWithIdentifier(
  auth: Auth,
  identifier: string,
  password: string
): Promise<void> {
  await signInWithIdentifier(
    async (email, candidatePassword) => {
      await signInWithEmailAndPassword(auth, email, candidatePassword);
    },
    identifier,
    password
  );
}
