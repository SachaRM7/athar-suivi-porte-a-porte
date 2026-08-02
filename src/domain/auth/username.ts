export type PasswordSignIn = (email: string, password: string) => Promise<void>;

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error('Username must contain 3 to 32 lowercase ASCII characters.');
  }
  return normalized;
}

export function technicalEmailForUsername(username: string): string {
  return `${normalizeUsername(username)}@auth.athar.invalid`;
}

export async function signInWithUsername(
  signIn: PasswordSignIn,
  username: string,
  password: string
): Promise<void> {
  await signIn(technicalEmailForUsername(username), password);
}

