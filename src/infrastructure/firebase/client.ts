import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { environment } from '../../app/config/environment';

export type FirebaseClient = { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions };

let client: FirebaseClient | null = null;

export function getFirebaseClient(): FirebaseClient {
  if (client) return client;
  if (!environment.firebase) throw new Error('Firebase is not configured for this environment.');
  const app = getApps().length > 0 ? getApp() : initializeApp(environment.firebase);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app);
  if (environment.firebase.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8180);
    connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  }
  client = { app, auth, firestore, functions };
  return client;
}
