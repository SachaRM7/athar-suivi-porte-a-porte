import { signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { signInWithUsername } from '../../domain/auth/username';

/** Client-side sign-in only. Account creation remains a privileged backend action. */
export async function signInToFirebaseWithUsername(
  auth: Auth,
  username: string,
  password: string
): Promise<void> {
  await signInWithUsername(
    async (email, candidatePassword) => {
      await signInWithEmailAndPassword(auth, email, candidatePassword);
    },
    username,
    password
  );
}
