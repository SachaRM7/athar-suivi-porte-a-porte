export type PasswordSignIn = (email: string, password: string) => Promise<void>;

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Nommée pour que l'interface distingue une saisie invalide d'un refus du serveur. */
export class InvalidUsernameError extends Error {
  constructor() {
    super('Username must contain 3 to 32 lowercase ASCII characters.');
    this.name = 'InvalidUsernameError';
  }
}

export function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new InvalidUsernameError();
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

