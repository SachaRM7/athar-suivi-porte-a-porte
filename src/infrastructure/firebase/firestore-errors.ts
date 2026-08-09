type FirebaseLikeError = {
  code?: unknown;
  message?: unknown;
};

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const code = (error as FirebaseLikeError).code;
  return typeof code === 'string' ? code.toLowerCase() : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error !== 'object' || error === null) return '';
  const message = (error as FirebaseLikeError).message;
  return typeof message === 'string' ? message : '';
}

export function isRecoverableFirestoreCacheError(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error);
  return code === 'internal' || code === 'firestore/internal' ||
    /internal assertion failed|indexeddb|idb-set|quotaexceedederror/i.test(message);
}

export function firestoreWriteErrorMessage(error: unknown, fallback: string): string {
  const code = errorCode(error).replace(/^firestore\//, '');
  if (code === 'permission-denied') return 'Firebase refuse cette écriture. Les droits du workspace doivent être remis à jour.';
  if (code === 'unauthenticated') return 'La session Firebase a expiré. Reconnecte-toi, puis réessaie.';
  if (code === 'unavailable') return 'Firebase est momentanément indisponible. Vérifie la connexion, puis réessaie.';
  if (code === 'aborted' || code === 'failed-precondition') return 'Les données ont changé sur un autre appareil. Recharge le bâtiment, puis réessaie.';
  return fallback;
}
