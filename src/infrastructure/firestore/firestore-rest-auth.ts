export type FirestoreRestAuth = {
  projectId: string;
  getIdToken(): Promise<string | null>;
  /**
   * Origine de l'API REST Firestore. Absente en production (Google) ; pointée sur
   * l'émulateur en recette locale, sinon une écriture de test partirait vers le cloud.
   */
  origin?: string;
};

export const FIRESTORE_REST_PRODUCTION_ORIGIN = 'https://firestore.googleapis.com';
export const FIRESTORE_REST_EMULATOR_ORIGIN = 'http://127.0.0.1:8180';

export function firestoreRestApi(auth: Pick<FirestoreRestAuth, 'origin'>): string {
  return `${auth.origin ?? FIRESTORE_REST_PRODUCTION_ORIGIN}/v1`;
}
