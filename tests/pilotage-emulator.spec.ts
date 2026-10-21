import { expect, test, type Page } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { geohashForLocation } from 'geofire-common';
const app = initializeApp({ projectId: 'athar-local' }, 'lot-e-browser');
const db = getFirestore(app);
const workspace = db.doc('workspaces/main');
const password = 'Temporary-password-123';
const zoneId = 'lot-e-browser';
async function signIn(page: Page, username: string, pass = password) {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail ou identifiant').fill(username);
  await page.getByLabel('Mot de passe').fill(pass);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Zones de Toulouse|Choisis la zone/ })).toBeVisible({ timeout: 30_000 });
}
test.beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180') throw new Error('Emulator-only test.');
  for (const uid of ['lot-e-lead', 'lot-e-visitor']) {
    await getAuth(app).createUser({ uid, email: `${uid}@auth.athar.invalid`, password }).catch(error => { if (error.code !== 'auth/uid-already-exists') throw error; });
    await workspace.collection('members').doc(uid).set({ username: uid, displayName: uid, role: 'member', active: true, createdAt: Timestamp.now() });
  }
  const location = new GeoPoint(43.606, 1.4454);
  const geohash = geohashForLocation([43.606,1.4454]);
  const batch = db.batch();
  batch.set(workspace.collection('zones').doc(zoneId), { name: 'Zone de recette E', color: '#16324F', coverageState: 'active', assigneeLabel: null, bbox: { north: 43.608, south: 43.6052, east: 1.451, west: 1.443 }, geometry: { type: 'Polygon', vertices: [{ latitude: 43.6052, longitude: 1.443 },{ latitude: 43.6052, longitude: 1.451 },{ latitude: 43.608, longitude: 1.451 },{ latitude: 43.608, longitude: 1.443 },{ latitude: 43.6052, longitude: 1.443 }] } });
  batch.set(workspace.collection('buildings').doc('lot-e-building'), { addressLabel: '16 rue du Pilotage, Toulouse', zoneId, location, geohash, createdBy: 'admin-1', structureRevision: 1 });
  batch.set(workspace.collection('doors').doc('lot-e-door'), { buildingId: 'lot-e-building', zoneId, location, geohash, floor: 0, label: '01', sortOrder: 0, active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, lastVisitAt: null, createdBy: 'admin-1', foyer: null, aConfierAuxSoeurs: false });
  await batch.commit();
});
test.afterAll(async () => { await db.terminate(); await deleteApp(app); });

test('administrator creates, suspends, reactivates, resets and changes a member role through the UI @emulator', async ({ browser }) => {
  test.setTimeout(180_000);
  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const member = await memberContext.newPage();
  try {
    await signIn(admin, 'pilot.admin');
    await admin.goto('/admin/members');
    await admin.getByLabel('Identifiant', { exact: true }).fill('lot.e.created');
    await admin.getByLabel('Nom affiché').fill('Membre créé E');
    await admin.getByLabel('Mot de passe temporaire', { exact: true }).fill(password);
    await admin.getByRole('button', { name: 'Créer le membre' }).click();
    await expect(admin.getByText('Compte lot.e.created créé.', { exact: false })).toBeVisible();
    // Auth IDs are random: the list may need its second page.
    if (await admin.getByRole('heading', { name: 'Membre créé E', exact: true }).count() === 0) await admin.getByRole('button', { name: 'Actualiser les membres' }).click();
    const row = admin.locator('.pilotage-list > li').filter({ has: admin.getByRole('heading', { name: 'Membre créé E', exact: true }) });
    await expect(row).toBeVisible();
    await signIn(member, 'lot.e.created');
    await row.getByRole('button', { name: 'Suspendre l’accès' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirmer la modification' }).click();
    await expect(member.getByRole('heading', { name: 'Accès suspendu' })).toBeVisible({ timeout: 20_000 });
    await expect(row.getByRole('button', { name: 'Réactiver l’accès' })).toBeVisible();
    await row.getByRole('button', { name: 'Réactiver l’accès' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirmer la modification' }).click();
    await expect(row.getByRole('button', { name: 'Suspendre l’accès' })).toBeVisible();
    await row.getByRole('button', { name: 'Nommer administrateur' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirmer la modification' }).click();
    await expect(row.getByRole('button', { name: 'Passer en membre' })).toBeVisible();
    await member.goto('/admin');
    // Suspension/role changes revoke refresh tokens: reopening requires a new sign-in.
    await signIn(member, 'lot.e.created');
    await member.goto('/admin');
    await expect(member.getByRole('heading', { name: 'Couverture terrain' })).toBeVisible();
    await row.getByRole('button', { name: 'Passer en membre' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirmer la modification' }).click();
    await expect(member.getByRole('heading', { name: 'Accès réservé' })).toBeVisible();
    await row.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
    await admin.getByLabel('Nouveau mot de passe temporaire').fill('New-temporary-password-456');
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirmer la modification' }).click();
    await expect(admin.getByText('Réinitialiser le mot de passe : modification confirmée', { exact: false })).toBeVisible();
    const fresh = await browser.newContext();
    try { await signIn(await fresh.newPage(), 'lot.e.created', 'New-temporary-password-456'); } finally { await fresh.close(); }
  } finally { await adminContext.close(); await memberContext.close(); }
});

test('an outing preserves an offline passage across reload and includes its late sync after closure @emulator', async ({ browser }) => {
  test.setTimeout(240_000);
  const leadContext = await browser.newContext();
  const visitorContext = await browser.newContext();
  await visitorContext.addInitScript(() => {
    localStorage.setItem('athar.trusted-device','true');
    Object.defineProperty(Navigator.prototype,'onLine',{ configurable: true, get: () => localStorage.getItem('athar.test-firebase-offline') !== 'true' });
  });
  const lead = await leadContext.newPage();
  const visitor = await visitorContext.newPage();
  try {
    await Promise.all([signIn(lead,'lot-e-lead'), signIn(visitor,'lot-e-visitor')]);
    await lead.goto(`/outings?zone=${zoneId}`);
    await lead.getByLabel('Nom de la sortie').fill('Sortie navigateur E');
    await lead.getByLabel('Zone de la sortie').selectOption(zoneId);
    await lead.getByRole('button',{ name:'Démarrer la sortie', exact:true }).click();
    await expect(lead.getByRole('heading',{ name:'Ma sortie : Sortie navigateur E' })).toBeVisible();
    const outings = await workspace.collection('outings').where('ownerId','==','lot-e-lead').get();
    const outingId = outings.docs[0].id;
    await visitor.goto('/outings');
    const row = visitor.locator('.pilotage-list > li').filter({ has: visitor.getByRole('heading',{ name:'Sortie navigateur E', exact:true }) });
    await row.getByRole('button',{ name:'Rejoindre la sortie' }).click();
    await expect(visitor.getByRole('heading',{ name:'Ma sortie : Sortie navigateur E' })).toBeVisible();
    await visitor.getByRole('link',{ name:'Carte terrain', exact:true }).click();
    const building = visitor.getByRole('button',{ name:'16 rue du Pilotage, Toulouse' });
    await expect(building).toBeVisible({ timeout:45_000 });
    await building.click();
    await expect(visitor.getByRole('button',{ name:'Porte 01, Pas encore fait' })).toBeVisible();
    await visitorContext.route(/127\.0\.0\.1:(8180|9199|5101)/,route=>route.abort());
    await visitor.evaluate(() => { localStorage.setItem('athar.test-firebase-offline','true'); window.dispatchEvent(new Event('offline')); });
    await visitor.getByRole('button',{ name:'Porte 01, Pas encore fait' }).click();
    await visitor.getByRole('button',{ name:'Absent', exact:true }).click();
    const entries = () => visitor.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve,reject)=>{ const request=indexedDB.open('athar-prototype-outbox'); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
      const values = await new Promise<Array<{ outingId?: string; state: string }>>((resolve,reject)=>{ const request=database.transaction('entries').objectStore('entries').index('authorId').getAll('lot-e-visitor'); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
      database.close(); return values;
    });
    await expect.poll(entries).toMatchObject([{ outingId, state:'pending' }]);
    await visitor.reload();
    await expect(visitor.getByRole('heading',{ name:'Zones de Toulouse' })).toBeVisible({ timeout:30_000 });
    await expect.poll(entries).toMatchObject([{ outingId, state:'pending' }]);
    await lead.getByRole('button',{ name:'Terminer la sortie', exact:true }).click();
    await lead.getByRole('dialog').getByRole('button',{ name:'Terminer la sortie' }).click();
    await expect(lead.getByTestId('outing-summary')).toHaveText('0 passages synchronisés · 0 portes distinctes');
    await visitorContext.unroute(/127\.0\.0\.1:(8180|9199|5101)/);
    await visitor.evaluate(()=>{ localStorage.removeItem('athar.test-firebase-offline'); window.dispatchEvent(new Event('online')); });
    await expect.poll(entries,{ timeout:30_000 }).toHaveLength(0);
    await lead.getByRole('button',{ name:'Actualiser le bilan' }).click();
    await expect(lead.getByTestId('outing-summary')).toHaveText('1 passages synchronisés · 1 portes distinctes');
    await expect(lead.getByText('1 passages reçus après clôture', { exact:false })).toBeVisible();
    const stored = await workspace.collection('visits').where('outingId','==',outingId).get();
    expect(stored.size).toBe(1); expect(stored.docs[0].data().authorId).toBe('lot-e-visitor');
  } finally { await leadContext.close(); await visitorContext.close(); }
});
