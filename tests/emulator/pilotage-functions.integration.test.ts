import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
const app = initializeApp({ projectId: 'athar-local' }, 'lot-e-pilotage');
const db = getFirestore(app);
const auth = getAuth(app);
const workspaceId = 'lot-e-tests';
const root = db.doc(`workspaces/${workspaceId}`);
const password = 'Temporary-password-123';
const tokens: Record<string, string> = {};
async function token(uid: string, pass = password) {
  const response = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${uid}@auth.athar.invalid`, password: pass, returnSecureToken: true }) });
  const body = await response.json();
  return { status: response.status, token: body.idToken };
}
async function call(name: string, uid: string, data: Record<string, unknown> = {}) {
  const response = await fetch(`http://127.0.0.1:5101/athar-local/us-central1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tokens[uid] ? { Authorization: `Bearer ${tokens[uid]}` } : {}) }, body: JSON.stringify({ data: { workspaceId, ...data } }) });
  return { status: response.status, body: await response.json() };
}
beforeAll(async () => {
  for (const [uid, role, active] of [['e-admin','admin',true], ['e-admin2','admin',true], ['e-member','member',true], ['e-guest','member',true], ['e-inactive','admin',false]] as const) {
    await auth.createUser({ uid, email: `${uid}@auth.athar.invalid`, password });
    await root.collection('members').doc(uid).set({ username: uid, displayName: uid, role, active, createdAt: Timestamp.now() });
    tokens[uid] = (await token(uid)).token;
  }
  await root.collection('zones').doc('zone-e').set({ name: 'Zone E' });
});
afterAll(() => deleteApp(app));

describe('Lot E privileged member management', () => {
  it('refuses anonymous, regular and inactive callers even with valid tokens', async () => {
    for (const uid of ['anonymous','e-member','e-inactive']) {
      expect([401,403]).toContain((await call('listMembers', uid)).status);
      expect([401,403]).toContain((await call('manageMember', uid, { targetId: 'e-guest', action: 'promote' })).status);
    }
  });
  it('reads members and auth metadata without passwords and paginates completely', async () => {
    const batch = db.batch();
    for (let i = 0; i < 30; i++) batch.set(root.collection('members').doc(`page-${i.toString().padStart(2,'0')}`), { username: `page-${i}`, displayName: 'Pagination', role: 'member', active: false, createdAt: Timestamp.now() });
    await batch.commit();
    const first = await call('listMembers','e-admin');
    expect(first.status).toBe(200); expect(first.body.result.members).toHaveLength(25);
    const second = await call('listMembers','e-admin',{ cursor: first.body.result.nextCursor });
    expect(second.body.result.members).toHaveLength(10);
    expect(second.body.result.nextCursor).toBeNull();
    expect(JSON.stringify(first.body)).not.toContain(password);
    expect(first.body.result.members.find((m: { id: string }) => m.id === 'e-admin').lastSignInAt).toBeTruthy();
  });
  it('prevents self removal, updates roles using membership authority, and traces operations', async () => {
    expect((await call('manageMember','e-admin',{ targetId: 'e-admin', action: 'demote' })).status).toBe(400);
    expect((await call('manageMember','e-admin',{ targetId: 'e-guest', action: 'promote' })).status).toBe(200);
    // The existing token has no admin claim; the authoritative document grants access.
    expect((await call('listMembers','e-guest')).status).toBe(200);
    expect((await call('manageMember','e-admin',{ targetId: 'e-guest', action: 'demote' })).status).toBe(200);
    expect((await call('listMembers','e-guest')).status).toBe(403);
  });
  it('suspends immediately, disables Auth and can reactivate without deleting history', async () => {
    expect((await call('manageMember','e-admin',{ targetId: 'e-guest', action: 'suspend' })).status).toBe(200);
    expect((await root.collection('members').doc('e-guest').get()).data()?.active).toBe(false);
    expect((await auth.getUser('e-guest')).disabled).toBe(true);
    expect((await call('listOutings','e-guest')).status).toBe(403);
    expect((await call('manageMember','e-admin',{ targetId: 'e-guest', action: 'reactivate' })).status).toBe(200);
    expect((await auth.getUser('e-guest')).disabled).toBe(false);
  });
  it('resets the password without logging it and rejects malformed credentials', async () => {
    expect((await call('manageMember','e-admin',{ targetId: 'e-guest', action: 'reset-password', temporaryPassword: 'short' })).status).toBe(400);
    const nextPassword = 'New-temporary-password-456';
    expect((await call('manageMember','e-admin',{ targetId: 'e-guest', action: 'reset-password', temporaryPassword: nextPassword })).status).toBe(200);
    expect((await token('e-guest')).status).toBe(400);
    expect((await token('e-guest', nextPassword)).status).toBe(200);
    const audit = await root.collection('memberAudit').get();
    expect(audit.size).toBeGreaterThan(0);
    expect(JSON.stringify(audit.docs.map(doc => doc.data()))).not.toContain(nextPassword);
  });
  it('serializes concurrent mutual demotions so at least one administrator remains', async () => {
    const responses = await Promise.all([
      call('manageMember','e-admin',{ targetId: 'e-admin2', action: 'demote' }),
      call('manageMember','e-admin2',{ targetId: 'e-admin', action: 'demote' })
    ]);
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    const admins = await root.collection('members').where('role','==','admin').where('active','==',true).get();
    expect(admins.size).toBe(1);
  });
});

describe('Lot E real outings and reproducible reports', () => {
  it('starts idempotently, joins explicitly and rejects two active outings', async () => {
    for (let retry = 0; retry < 2; retry++) expect((await call('manageOuting','e-member',{ action: 'start', outingId: 'outing-e', zoneId: 'zone-e', title: 'Sortie E' })).status).toBe(200);
    expect((await root.collection('outings').get()).size).toBe(1);
    expect((await call('manageOuting','e-member',{ action: 'start', outingId: 'another-e', zoneId: 'zone-e', title: 'Duplicate' })).status).toBe(400);
    expect((await call('manageOuting','e-guest',{ action: 'join', outingId: 'outing-e' })).status).toBe(200);
    expect((await call('manageOuting','e-guest',{ action: 'end', outingId: 'outing-e' })).status).toBe(403);
  });
  it('ends without losing late arrivals, clears member selection and excludes out-of-period data', async () => {
    const outingRef = root.collection('outings').doc('outing-e');
    const start = Timestamp.fromMillis(Date.now() - 10_000);
    const joined = Timestamp.fromMillis(Date.now() - 8_000);
    const data = (await outingRef.get()).data()!;
    await outingRef.update({ startedAt: start, participants: { ...data.participants, 'e-member': { ...data.participants['e-member'], joinedAt: start }, 'e-guest': { ...data.participants['e-guest'], joinedAt: joined } } });
    expect((await call('manageOuting','e-member',{ action: 'end', outingId: 'outing-e' })).status).toBe(200);
    expect((await root.collection('members').doc('e-member').get()).data()?.activeOuting).toBeNull();
    expect((await root.collection('members').doc('e-guest').get()).data()?.activeOuting).toBeNull();
    const end = (await outingRef.get()).data()!.endedAt;
    const batch = db.batch();
    for (const [id, at] of [['one', joined], ['two', joined], ['outside', Timestamp.fromMillis(end.toMillis()+1000)]] as const) batch.set(root.collection('visits').doc(id), { outingId: 'outing-e', authorId: 'e-member', doorId: 'same-door', statusId: 'retry', occurredAt: at, syncedAt: Timestamp.fromMillis(end.toMillis()+2000), note: 'secret' });
    await batch.commit();
    const report = await call('getOutingReport','e-member',{ outingId: 'outing-e' });
    expect(report.status).toBe(200);
    expect(report.body.result).toMatchObject({ visitCount: 2, doorCount: 1, outsidePeriodCount: 1, lateSyncCount: 2, source: 'server' });
    expect(JSON.stringify(report.body)).not.toContain('secret');
    expect((await call('manageOuting','e-admin',{ action: 'join', outingId: 'outing-e' })).status).toBe(400);
  });
  it('pages equal-date outings without duplicates or missing rows', async () => {
    const data = (await root.collection('outings').doc('outing-e').get()).data()!;
    const batch = db.batch();
    for (let i = 0; i < 30; i++) batch.set(root.collection('outings').doc(`page-${i}`), data);
    await batch.commit();
    const first = await call('listOutings','e-member');
    const second = await call('listOutings','e-member',{ cursor: first.body.result.nextCursor });
    const ids = [...first.body.result.outings, ...second.body.result.outings].map((o: { id: string }) => o.id);
    expect(ids).toHaveLength(31); expect(new Set(ids).size).toBe(31);
  });
});
