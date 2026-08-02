import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { connectAuthEmulator, getAuth as getClientAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore as getClientFirestore } from 'firebase/firestore';
import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from 'firebase/app';
import { afterAll, describe, expect, it } from 'vitest';
import { observeAuthSession } from '../../src/infrastructure/firebase/auth-session-gateway';

const projectId = 'athar-local';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.GCLOUD_PROJECT = projectId;

const app = initializeApp({ projectId }, 'athar-emulator-admin-test');

async function callCreateMember(uid: string, email: string, password: string, input: Record<string, unknown>, clientName: string) {
  const clientApp = initializeClientApp({ apiKey: 'local-api-key', authDomain: 'localhost', projectId }, clientName);
  const clientAuth = getClientAuth(clientApp);
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const credential = await signInWithEmailAndPassword(clientAuth, email, password);
  const token = await credential.user.getIdToken(true);
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/us-central1/createMember`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: input })
  });
  await deleteClientApp(clientApp);
  return { uid, response, body: await response.json() };
}

afterAll(async () => {
  await Promise.all(getApps().filter((candidate) => candidate.name === app.name).map(deleteApp));
});

describe('Auth and Functions emulators', () => {
  it('serves the local function health endpoint', async () => {
    const response = await fetch(`http://127.0.0.1:5101/${projectId}/us-central1/emulatorHealth`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ emulator: true, service: 'athar-functions' });
  });

  it('lets the Admin SDK provision a private password account in the Auth emulator', async () => {
    const uid = 'provisioned-member';
    const auth = getAuth(app);
    const created = await auth.createUser({
      uid,
      email: 'provisioned-member@auth.athar.invalid',
      password: 'Temporary-password-123',
      displayName: 'Provisioned Member'
    });
    const loaded = await auth.getUser(uid);

    expect(created.uid).toBe(uid);
    expect(loaded.email).toBe('provisioned-member@auth.athar.invalid');
  });

  it('provisions a workspace member only through the privileged function', async () => {
    const adminUid = 'workspace-admin';
    const adminAuth = getAuth(app);
    await adminAuth.createUser({
      uid: adminUid,
      email: 'workspace-admin@auth.athar.invalid',
      password: 'Temporary-password-123'
    });
    await adminAuth.setCustomUserClaims(adminUid, { role: 'admin' });
    await getFirestore(app).doc(`workspaces/main/members/${adminUid}`).set({
      username: 'workspace-admin',
      displayName: 'Workspace Admin',
      role: 'admin',
      active: true,
      createdAt: Timestamp.now()
    });

    const { response, body } = await callCreateMember(adminUid, 'workspace-admin@auth.athar.invalid', 'Temporary-password-123', {
      workspaceId: 'main', username: 'field-user', displayName: 'Field User', temporaryPassword: 'Temporary-password-123'
    }, 'athar-emulator-client');

    expect(response.status).toBe(200);
    expect(body.result.username).toBe('field-user');
    await expect(adminAuth.getUser(body.result.uid)).resolves.toMatchObject({
      email: 'field-user@auth.athar.invalid'
    });
    await expect(getFirestore(app).doc(`workspaces/main/members/${body.result.uid}`).get()).resolves.toMatchObject({
      exists: true
    });
  });

  it('rejects provisioning by a regular active member', async () => {
    const password = 'Temporary-password-123';
    await getAuth(app).createUser({ uid: 'regular-member', email: 'regular-member@auth.athar.invalid', password });
    await getAuth(app).setCustomUserClaims('regular-member', { role: 'member' });
    await getFirestore(app).doc('workspaces/main/members/regular-member').set({ username: 'regular-member', displayName: 'Regular', role: 'member', active: true, createdAt: Timestamp.now() });

    const { response, body } = await callCreateMember('regular-member', 'regular-member@auth.athar.invalid', password, {
      workspaceId: 'main', username: 'forbidden-user', displayName: 'Forbidden', temporaryPassword: password
    }, 'athar-emulator-regular-client');
    expect(response.status).toBe(403);
    expect(body.error.status).toBe('PERMISSION_DENIED');
  });

  it('rejects an admin claim when the workspace membership is inactive', async () => {
    const password = 'Temporary-password-123';
    await getAuth(app).createUser({ uid: 'inactive-admin', email: 'inactive-admin@auth.athar.invalid', password });
    await getAuth(app).setCustomUserClaims('inactive-admin', { role: 'admin' });
    await getFirestore(app).doc('workspaces/main/members/inactive-admin').set({ username: 'inactive-admin', displayName: 'Inactive', role: 'admin', active: false, createdAt: Timestamp.now() });

    const { response, body } = await callCreateMember('inactive-admin', 'inactive-admin@auth.athar.invalid', password, {
      workspaceId: 'main', username: 'forbidden-admin-user', displayName: 'Forbidden', temporaryPassword: password
    }, 'athar-emulator-inactive-admin-client');
    expect(response.status).toBe(403);
    expect(body.error.status).toBe('PERMISSION_DENIED');
  });

  it('observes an active workspace session after technical username sign-in', async () => {
    const password = 'Temporary-password-123';
    await getAuth(app).createUser({ uid: 'observed-member', email: 'observed-member@auth.athar.invalid', password });
    await getFirestore(app).doc('workspaces/main/members/observed-member').set({
      username: 'observed-member', displayName: 'Observed Member', role: 'member', active: true, createdAt: Timestamp.now()
    });
    const clientApp = initializeClientApp({ apiKey: 'local-api-key', authDomain: 'localhost', projectId }, 'athar-observed-session-client');
    const clientAuth = getClientAuth(clientApp);
    const clientFirestore = getClientFirestore(clientApp);
    connectAuthEmulator(clientAuth, 'http://127.0.0.1:9199', { disableWarnings: true });
    connectFirestoreEmulator(clientFirestore, '127.0.0.1', 8180);
    const active = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Active session observation timed out.')), 10_000);
      let unsubscribe = () => undefined;
      unsubscribe = observeAuthSession(clientAuth, clientFirestore, 'main', (snapshot) => {
        if (snapshot.status !== 'active') return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(snapshot.session.member.username);
      });
    });
    await signInWithEmailAndPassword(clientAuth, 'observed-member@auth.athar.invalid', password);
    await expect(active).resolves.toBe('observed-member');
    await deleteClientApp(clientApp);
  });
});
