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

export function emailForIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  if (normalized.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new InvalidUsernameError();
    return normalized;
  }
  return technicalEmailForUsername(normalized);
}

export async function signInWithIdentifier(
  signIn: PasswordSignIn,
  identifier: string,
  password: string
): Promise<void> {
  await signIn(emailForIdentifier(identifier), password);
}
