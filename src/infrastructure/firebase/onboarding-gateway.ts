import { createUserWithEmailAndPassword, updateProfile, type Auth } from 'firebase/auth';
import { httpsCallable, type Functions } from 'firebase/functions';

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export type MemberProfileInput = { username: string; displayName: string };

function normalizeProfile(input: MemberProfileInput): MemberProfileInput {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!usernamePattern.test(username) || displayName.length < 1 || displayName.length > 80) {
    throw new Error('Renseignez un identifiant valide et un nom entre 1 et 80 caracteres.');
  }
  return { username, displayName };
}

async function finalize(functions: Functions, input: MemberProfileInput): Promise<void> {
  const callable = httpsCallable<MemberProfileInput, { uid: string }>(functions, 'registerMember');
  await callable(input);
}

export async function registerMemberWithPassword(
  auth: Auth,
  functions: Functions,
  input: MemberProfileInput & { password: string }
): Promise<void> {
  const profile = normalizeProfile(input);
  if (input.password.length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caracteres.');
  const credential = await createUserWithEmailAndPassword(auth, `${profile.username}@auth.athar.invalid`, input.password);
  await updateProfile(credential.user, { displayName: profile.displayName });
  await finalize(functions, profile);
}

export async function finalizeMemberRegistration(functions: Functions, input: MemberProfileInput): Promise<void> {
  await finalize(functions, normalizeProfile(input));
}
