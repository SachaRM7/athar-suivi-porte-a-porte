import { InvalidUsernameError } from './username';

/**
 * Traduit un échec de connexion en une phrase utile.
 *
 * `AGENTS.md` : « Une erreur explique ce qui s'est passé et comment le réparer. Elle ne
 * s'excuse pas. » Un service injoignable et un mot de passe faux n'ont pas la même
 * réparation ; les confondre envoie chercher au mauvais endroit.
 */

const WRONG_CREDENTIALS = 'E-mail, identifiant ou mot de passe incorrect.';

export type SignInFailureContext = {
  /** En développement, le service visé est l'émulateur local, pas le projet Firebase. */
  useEmulators: boolean;
};

function firebaseErrorCode(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return null;
  const code = (cause as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function signInErrorMessage(cause: unknown, context: SignInFailureContext): string {
  if (cause instanceof InvalidUsernameError) {
    return 'Saisis une adresse e-mail valide ou un identifiant de 3 à 32 caractères.';
  }

  switch (firebaseErrorCode(cause)) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return WRONG_CREDENTIALS;
    case 'auth/network-request-failed':
      return context.useEmulators
        ? 'Le service d’authentification local ne répond pas. Démarrez les émulateurs avec « npm run dev:local », puis réessayez.'
        : 'Pas de connexion. La connexion initiale nécessite du réseau ; ensuite l’app fonctionne hors ligne.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    case 'auth/user-disabled':
      return 'Ce compte est désactivé. Demandez sa réactivation à un coordinateur.';
    case 'auth/operation-not-allowed':
      return 'La connexion par mot de passe est désactivée sur ce projet Firebase. Activez-la dans la console.';
    default:
      return WRONG_CREDENTIALS;
  }
}
