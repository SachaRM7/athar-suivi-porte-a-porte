import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { environment } from '../../app/config/environment';
import { isTrustedDevice } from '../offline/device-storage';
import { FIRESTORE_REST_EMULATOR_ORIGIN, type FirestoreRestAuth } from '../firestore/firestore-rest-auth';

export type FirebaseClient = { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions };

let client: FirebaseClient | null = null;

export function getFirebaseClient(): FirebaseClient {
  if (client) return client;
  if (!environment.firebase) throw new Error('Firebase is not configured for this environment.');
  const app = getApps().length > 0 ? getApp() : initializeApp(environment.firebase);
  const auth = getAuth(app);
  const firestore = initializeFirestore(app, {
    // Politique documentée (etat-projet, lot A1.4) : le cache IndexedDB de Firestore, qui
    // garde une zone préparée lisible dans une cage d'escalier, n'est activé que sur un
    // appareil déclaré de confiance. Ailleurs, le cache reste en mémoire : rien de métier
    // ne survit à la fermeture, et la purge de déconnexion n'a pas de base à effacer.
    // Les passages en attente, eux, vivent dans la file IndexedDB d'Athar dans les deux cas.
    localCache: isTrustedDevice()
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache()
  });
  const functions = getFunctions(app);
  if (environment.firebase.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8180);
    connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  }
  client = { app, auth, firestore, functions };
  return client;
}

export async function clearFirebaseLocalCache(): Promise<boolean> {
  if (!client) return true;
  const firestore = client.firestore;
  client = null;
  try {
    await terminate(firestore);
    await clearIndexedDbPersistence(firestore);
    return true;
  } catch {
    return false;
  }
}

/**
 * Identité REST du compte connecté. Lue au moment de chaque écriture : un changement de
 * compte ne réutilise jamais le jeton du précédent. En recette, vise l'émulateur.
 */
export function firestoreRestAuthFor(firebaseClient: FirebaseClient): FirestoreRestAuth {
  return {
    projectId: firebaseClient.app.options.projectId ?? '',
    getIdToken: async () => firebaseClient.auth.currentUser?.getIdToken() ?? null,
    ...(environment.firebase?.useEmulators ? { origin: FIRESTORE_REST_EMULATOR_ORIGIN } : {})
  };
}
