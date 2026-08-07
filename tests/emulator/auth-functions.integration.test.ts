import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'node:crypto';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth as getClientAuth, signInWithEmailAndPassword } from 'firebase/auth';
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
  return callCallable('createMember', email, password, input, clientName, uid);
}

async function callCallable(name: string, email: string, password: string, input: Record<string, unknown>, clientName: string, uid = '') {
  const clientApp = initializeClientApp({ apiKey: 'local-api-key', authDomain: 'localhost', projectId }, clientName);
  const clientAuth = getClientAuth(clientApp);
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const credential = await signInWithEmailAndPassword(clientAuth, email, password);
  const token = await credential.user.getIdToken(true);
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/us-central1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: input })
  });
  await deleteClientApp(clientApp);
  return { uid, response, body: await response.json() };
}

async function signUpAndRegister(username: string, displayName: string, password: string, clientName: string) {
  const clientApp = initializeClientApp({ apiKey: 'local-api-key', authDomain: 'localhost', projectId }, clientName);
  const clientAuth = getClientAuth(clientApp);
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(clientAuth, `${username}@auth.athar.invalid`, password);
  const token = await credential.user.getIdToken(true);
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/us-central1/registerMember`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { username, displayName } })
  });
  const body = await response.json();
  await deleteClientApp(clientApp);
  return { uid: credential.user.uid, response, body };
}

async function seedActiveMember(uid: string, username: string, password = 'Temporary-password-123') {
  await getAuth(app).createUser({ uid, email: `${username}@auth.athar.invalid`, password });
  await getFirestore(app).doc(`workspaces/main/members/${uid}`).set({
    username, displayName: username, role: 'member', active: true, createdAt: Timestamp.now()
  });
}

async function seedBootstrap(code: string) {
  await getFirestore(app).doc('workspaces/main/setup/admin-bootstrap').set({
    codeHash: createHash('sha256').update(code).digest('hex'), createdAt: Timestamp.now()
  });
}

afterAll(async () => {
  await Promise.all(getApps().filter((candidate) => candidate.name === app.name).map(deleteApp));
});

describe('Auth and Functions emulators', () => {
  it('serves the local callable endpoint without exporting a production health route', async () => {
    const response = await fetch(`http://127.0.0.1:5101/${projectId}/us-central1/createMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} })
    });
    expect([401, 403]).toContain(response.status);
    await expect(response.json()).resolves.toMatchObject({ error: { status: expect.any(String) } });
  });

  it('requires authentication before registration', async () => {
    const response = await fetch(`http://127.0.0.1:5101/${projectId}/us-central1/registerMember`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { username: 'new-member', displayName: 'New Member' } })
    });
    expect([401, 403]).toContain(response.status);
  });

  it('rejects non-string registration profile fields', async () => {
    const password = 'Temporary-password-123';
    await getAuth(app).createUser({ uid: 'typed-register-member', email: 'typed-register@auth.athar.invalid', password });
    const numericUsername = await callCallable('registerMember', 'typed-register@auth.athar.invalid', password, {
      username: 123,
      displayName: 'Typed Register'
    }, 'athar-register-numeric-username');
    expect(numericUsername.response.status).toBe(400);
    expect(numericUsername.body.error.status).toBe('INVALID_ARGUMENT');

    const objectDisplayName = await callCallable('registerMember', 'typed-register@auth.athar.invalid', password, {
      username: 'typed-register',
      displayName: { text: 'Typed Register' }
    }, 'athar-register-object-display-name');
    expect(objectDisplayName.response.status).toBe(400);
    expect(objectDisplayName.body.error.status).toBe('INVALID_ARGUMENT');
  });

  it('registers an authenticated username account as an active member and permits the same profile retry', async () => {
    const password = 'Temporary-password-123';
    const created = await signUpAndRegister('open-member', 'Open Member', password, 'athar-register-client');
    expect(created.response.status).toBe(200);
    const loaded = await getFirestore(app).doc(`workspaces/main/members/${created.uid}`).get();
    expect(Object.keys(loaded.data() || {}).sort()).toEqual([
      'active', 'createdAt', 'displayName', 'role', 'uid', 'username', 'workspaceId'
    ]);
    expect(loaded.data()).toMatchObject({
      uid: created.uid,
      username: 'open-member',
      displayName: 'Open Member',
      workspaceId: 'main',
      role: 'member',
      active: true,
      createdAt: expect.any(Timestamp)
    });
    const retry = await callCallable('registerMember', 'open-member@auth.athar.invalid', password, { username: 'open-member', displayName: 'Open Member' }, 'athar-register-retry');
    expect(retry.response.status).toBe(200);
  });

  it('handles concurrent registration retries for one authenticated UID as one idempotent member profile', async () => {
    const uid = 'concurrent-register-member';
    const username = 'concurrent-register';
    const password = 'Temporary-password-123';
    await getAuth(app).createUser({ uid, email: `${username}@auth.athar.invalid`, password });
    const input = { username, displayName: 'Concurrent Register' };
    const [first, second] = await Promise.all([
      callCallable('registerMember', `${username}@auth.athar.invalid`, password, input, 'athar-concurrent-register-first', uid),
      callCallable('registerMember', `${username}@auth.athar.invalid`, password, input, 'athar-concurrent-register-second', uid)
    ]);
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    const members = await getFirestore(app).collection('workspaces/main/members').where('username', '==', username).get();
    expect(members.docs).toHaveLength(1);
    expect(members.docs[0].id).toBe(uid);
    expect(members.docs[0].data()).toMatchObject({
      uid,
      displayName: input.displayName,
      workspaceId: 'main',
      role: 'member',
      active: true,
      createdAt: expect.any(Timestamp)
    });
  });

  it('rejects a different profile when the authenticated account already has a member', async () => {
    const password = 'Temporary-password-123';
    await signUpAndRegister('mismatch-member', 'Mismatch Member', password, 'athar-mismatch-create');
    const retry = await callCallable('registerMember', 'mismatch-member@auth.athar.invalid', password, { username: 'mismatch-member', displayName: 'Different Name' }, 'athar-mismatch-retry');
    expect(retry.response.status).toBe(409);
    expect(retry.body.error.status).toBe('ALREADY_EXISTS');
  });

  it('rejects malformed existing registration profiles without repairing them', async () => {
    const password = 'Temporary-password-123';
    const db = getFirestore(app);
    const cases = [
      {
        uid: 'register-missing-created-at',
        username: 'missing-created-at',
        profile: {
          uid: 'register-missing-created-at', username: 'missing-created-at', displayName: 'Missing Timestamp',
          workspaceId: 'main', role: 'member', active: true
        }
      },
      {
        uid: 'register-unexpected-field',
        username: 'unexpected-field',
        profile: {
          uid: 'register-unexpected-field', username: 'unexpected-field', displayName: 'Unexpected Field',
          workspaceId: 'main', role: 'member', active: true, createdAt: Timestamp.now(), unexpected: true
        }
      }
    ];

    for (const [index, malformed] of cases.entries()) {
      await getAuth(app).createUser({ uid: malformed.uid, email: `${malformed.username}@auth.athar.invalid`, password });
      const memberRef = db.doc(`workspaces/main/members/${malformed.uid}`);
      await memberRef.set(malformed.profile);
      const retry = await callCallable('registerMember', `${malformed.username}@auth.athar.invalid`, password, {
        username: malformed.username,
        displayName: malformed.profile.displayName
      }, `athar-register-malformed-${index}`);
      expect(retry.response.status).toBe(409);
      expect(retry.body.error.status).toBe('ALREADY_EXISTS');
      expect((await memberRef.get()).data()).toEqual(malformed.profile);
    }
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

  it('rejects a wrong initial administrator code without promoting the member', async () => {
    await seedActiveMember('bootstrap-wrong', 'bootstrap-wrong');
    await seedBootstrap(randomBytes(32).toString('hex'));
    const result = await callCallable('claimInitialAdmin', 'bootstrap-wrong@auth.athar.invalid', 'Temporary-password-123', { code: randomBytes(32).toString('hex') }, 'athar-wrong-bootstrap');
    expect(result.response.status).toBe(403);
    await expect(getFirestore(app).doc('workspaces/main/members/bootstrap-wrong').get()).resolves.toMatchObject({ exists: true });
    expect((await getFirestore(app).doc('workspaces/main/members/bootstrap-wrong').get()).data()?.role).toBe('member');
  });

  it('rejects an anonymous initial administrator claim', async () => {
    const response = await fetch(`http://127.0.0.1:5101/${projectId}/us-central1/claimInitialAdmin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { code: randomBytes(32).toString('hex') } })
    });
    expect([401, 403]).toContain(response.status);
    await expect(response.json()).resolves.toMatchObject({ error: { status: 'UNAUTHENTICATED' } });
  });

  it('selects exactly one initial administrator under concurrent claims and preserves existing claims', async () => {
    const code = randomBytes(32).toString('hex');
    await seedActiveMember('bootstrap-first', 'bootstrap-first');
    await seedActiveMember('bootstrap-second', 'bootstrap-second');
    await getAuth(app).setCustomUserClaims('bootstrap-first', { candidateClaim: 'first' });
    await getAuth(app).setCustomUserClaims('bootstrap-second', { candidateClaim: 'second' });
    await seedBootstrap(code);
    const [first, second] = await Promise.all([
      callCallable('claimInitialAdmin', 'bootstrap-first@auth.athar.invalid', 'Temporary-password-123', { code }, 'athar-bootstrap-first'),
      callCallable('claimInitialAdmin', 'bootstrap-second@auth.athar.invalid', 'Temporary-password-123', { code }, 'athar-bootstrap-second')
    ]);
    expect([first.response.status, second.response.status].filter((status) => status === 200)).toHaveLength(1);
    const marker = await getFirestore(app).doc('workspaces/main/setup/initial-admin').get();
    const winnerUid = marker.data()?.uid;
    expect(['bootstrap-first', 'bootstrap-second']).toContain(winnerUid);
    if (typeof winnerUid !== 'string') throw new Error('Initial administrator marker has no winner UID.');
    const winnerClaim = winnerUid === 'bootstrap-first' ? 'first' : 'second';
    expect((await getAuth(app).getUser(winnerUid)).customClaims).toMatchObject({ candidateClaim: winnerClaim, role: 'admin' });
  });

  it('repairs the selected UID custom claim after an authoritative prior promotion without admitting another UID', async () => {
    await seedActiveMember('repair-admin', 'repair-admin');
    await seedActiveMember('repair-other', 'repair-other');
    const db = getFirestore(app);
    await db.doc('workspaces/main/members/repair-admin').update({ role: 'admin' });
    await db.doc('workspaces/main/setup/initial-admin').set({ uid: 'repair-admin', createdAt: Timestamp.now() });
    const consumedCode = randomBytes(32).toString('hex');
    await db.doc('workspaces/main/setup/admin-bootstrap').set({ codeHash: createHash('sha256').update(consumedCode).digest('hex'), consumedBy: 'repair-admin', consumedAt: Timestamp.now() });
    const repair = await callCallable('claimInitialAdmin', 'repair-admin@auth.athar.invalid', 'Temporary-password-123', { code: consumedCode }, 'athar-repair-admin');
    expect(repair.response.status).toBe(200);
    expect((await getAuth(app).getUser('repair-admin')).customClaims).toMatchObject({ role: 'admin' });
    const blocked = await callCallable('claimInitialAdmin', 'repair-other@auth.athar.invalid', 'Temporary-password-123', { code: consumedCode }, 'athar-repair-other');
    expect(blocked.response.status).toBe(409);
  });
});
