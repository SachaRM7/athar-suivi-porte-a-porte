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
import { isRecoverableFirestoreCacheError } from './firestore-errors';

export type FirebaseClient = { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions };

let client: FirebaseClient | null = null;
const MEMORY_CACHE_RECOVERY_FLAG = 'athar:firestore-memory-cache';

function memoryCacheRecoveryRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(MEMORY_CACHE_RECOVERY_FLAG) === 'true';
  } catch {
    return false;
  }
}

export function getFirebaseClient(): FirebaseClient {
  if (client) return client;
  if (!environment.firebase) throw new Error('Firebase is not configured for this environment.');
  const app = getApps().length > 0 ? getApp() : initializeApp(environment.firebase);
  const auth = getAuth(app);
  const firestore = initializeFirestore(app, {
    // WP2: Firestore remains the source of truth while its IndexedDB cache keeps
    // a prepared zone usable in a stairwell or a basement without connectivity.
    localCache: memoryCacheRecoveryRequested()
      ? memoryLocalCache()
      : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
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
 * Un stockage IndexedDB saturé ou interrompu peut empoisonner l'instance Firestore.
 * La session recharge alors Firestore en mémoire après avoir tenté de vider le cache ;
 * les données métier restent sur le serveur et les passages en attente gardent leur outbox dédiée.
 */
export async function prepareFirestoreCacheRecovery(error: unknown): Promise<boolean> {
  if (!isRecoverableFirestoreCacheError(error)) return false;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(MEMORY_CACHE_RECOVERY_FLAG, 'true');
    } catch {
      // Le repli mémoire reste impossible à mémoriser, mais le nettoyage vaut la peine d'être tenté.
    }
  }
  await clearFirebaseLocalCache();
  return true;
}
