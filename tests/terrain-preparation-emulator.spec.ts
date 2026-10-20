import { expect, test, type Page } from '@playwright/test';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint } from 'firebase-admin/firestore';
import { geohashForLocation } from 'geofire-common';

// Dedicated emulator fixtures and temporary build artifact; never a production catalogue.
const app = initializeApp({ projectId: 'athar-local' }, 'lot-c-browser');
const db = getFirestore(app);
const workspace = db.doc('workspaces/main');
const fullArchive = 'dist/tiles/batiments-31.pmtiles';
let originalArchive: Buffer | null = null;
const zoneId = 'lot-c-terrain';
const address = '12 rue de l’Église, Toulouse';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail ou identifiant').fill('terrain.31');
  await page.getByLabel('Mot de passe').fill('Temporary-password-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: /Zones de Toulouse|Choisis la zone/ })).toBeVisible({ timeout: 20_000 });
  await page.goto(`/?zone=${zoneId}`);
  await expect(page.getByRole('button', { name: address })).toBeVisible({ timeout: 45_000 });
}

test.beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180') throw new Error('Emulator-only test.');
  originalArchive = await readFile(fullArchive).catch(() => null);
  await mkdir('dist/tiles', { recursive: true });
  await writeFile(fullArchive, await readFile('public/fixtures/batiments-carmes.pmtiles'));
});
test.afterAll(async () => {
  if (originalArchive) await writeFile(fullArchive, originalArchive);
  else await rm(fullArchive, { force: true });
  await db.terminate();
});
test.beforeEach(async () => {
  for (const id of ['lot-c-door', 'lot-c-door-other']) {
    const old = await workspace.collection('visits').where('doorId', '==', id).get();
    await Promise.all(old.docs.map(doc => doc.ref.delete()));
  }
  const batch = db.batch();
  batch.set(workspace.collection('zones').doc(zoneId), {
    name: 'Zone de recette C', color: '#16835F', coverageState: 'active', assigneeLabel: null,
    bbox: { north: 43.608, south: 43.6052, east: 1.451, west: 1.443 },
    geometry: { type: 'Polygon', vertices: [
      { latitude: 43.6052, longitude: 1.443 }, { latitude: 43.6052, longitude: 1.451 },
      { latitude: 43.608, longitude: 1.451 }, { latitude: 43.608, longitude: 1.443 }, { latitude: 43.6052, longitude: 1.443 }
    ] }
  });
  for (const [id, doorId, label, longitude] of [
    ['lot-c-building', 'lot-c-door', address, 1.4454],
    ['lot-c-building-other', 'lot-c-door-other', '14 rue de l’Église, Toulouse', 1.447]
  ] as const) {
    const location = new GeoPoint(43.606, longitude);
    const geohash = geohashForLocation([43.606, longitude]);
    batch.set(workspace.collection('buildings').doc(id), { addressLabel: label, location, geohash, zoneId, createdBy: 'admin-1', structureRevision: 0 });
    batch.set(workspace.collection('doors').doc(doorId), { buildingId: id, zoneId, location, geohash, floor: 0, label: '01', sortOrder: 0, active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, lastVisitAt: null, createdBy: 'admin-1', foyer: null, aConfierAuxSoeurs: false });
  }
  await batch.commit();
});

test('marking opens an explicit choice, scoped address search and a durable passage @emulator', async ({ page, context }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Rechercher parmi les bâtiments suivis' }).click();
  const search = page.getByRole('textbox', { name: 'Rechercher parmi les bâtiments suivis' });
  await search.fill('eglise 12');
  await expect(page.locator('.building-row')).toHaveCount(1);
  await search.fill('adresse absente');
  await expect(page.getByText('Aucune adresse correspondante', { exact: false })).toBeVisible();
  await expect(page.getByText('Aucun bâtiment décrit dans cette zone.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Effacer la recherche et les filtres' }).click();
  await page.getByRole('button', { name: 'Marquer une porte' }).click();
  const choice = page.getByRole('dialog', { name: 'Choisir un bâtiment pour marquer une porte' });
  await expect(choice).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(choice.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(choice.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Marquer une porte' })).toBeFocused();
  await page.getByRole('button', { name: 'Marquer une porte' }).click();
  await choice.getByRole('button', { name: new RegExp('12 rue') }).click();
  await expect(page.getByRole('button', { name: 'Porte 01, Pas encore fait' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Porte 01, Pas encore fait' }).click();
  await page.getByRole('button', { name: 'Absent', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByText('Porte 01 : passage enregistré sur l’appareil.')).toBeVisible();
  await page.getByRole('button', { name: 'Retour à la zone' }).click();
  await expect(page.getByLabel('Sauvegarde des passages')).toContainText('enregistrée sur l’appareil');
  await page.getByRole('button', { name: 'Marquer une porte' }).click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment' })).toContainText(address);
  await context.setOffline(false);
  await expect.poll(async () => (await workspace.collection('doors').doc('lot-c-door').get()).get('revision'), { timeout: 20_000 }).toBe(1);
});

test('a prepared authenticated zone reopens offline with both archives and syncs a new passage @emulator', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('athar.trusted-device', 'true'));
  let page = await context.newPage();
  try {
    await signIn(page);
    await page.getByRole('button', { name: 'Préparer hors ligne', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Préparer Zone de recette C hors ligne' });
    await dialog.getByRole('button', { name: 'Télécharger et vérifier la zone' }).click();
    await expect(dialog.getByText('Zone disponible hors ligne', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(dialog).toContainText('2 bâtiments et 2 portes en cache');
    await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
    await context.setOffline(true);
    await page.close();
    page = await context.newPage();
    await page.goto(`/?zone=${zoneId}`);
    await expect(page.getByRole('button', { name: address })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Zone hors ligne · vérifier' }).click();
    await expect(page.getByRole('dialog').getByText('Zone disponible hors ligne', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    const ranges = await page.evaluate(async () => Promise.all(['/fixtures/toulouse.pmtiles', '/tiles/batiments-31.pmtiles'].map(async path => {
      const response = await fetch(path, { headers: { Range: 'bytes=0-126' } });
      return [response.status, (await response.arrayBuffer()).byteLength];
    })));
    expect(ranges).toEqual([[206, 127], [206, 127]]);
    await page.getByRole('button', { name: address }).click();
    await page.getByRole('button', { name: 'Porte 01, Pas encore fait' }).click();
    await page.getByRole('button', { name: 'Absent', exact: true }).click();
    await expect(page.getByText('Porte 01 : passage enregistré sur l’appareil.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: address })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: address }).click();
    await expect(page.getByRole('button', { name: 'Porte 01, Absent' })).toBeVisible();
    // navigator.onLine may turn true before the first request can reach Firestore.
    // Repeated transport failures must retry without requiring another online event.
    let transportRefusals = 0;
    await page.route('http://127.0.0.1:8180/v1/**', async route => {
      if (route.request().method() === 'GET' && route.request().url().endsWith('/doors/lot-c-door') && transportRefusals++ < 2) await route.abort('internetdisconnected');
      else await route.continue();
    });
    await context.setOffline(false);
    await expect.poll(async () => (await workspace.collection('doors').doc('lot-c-door').get()).get('revision'), { timeout: 20_000 }).toBe(1);
    const visits = await workspace.collection('visits').where('doorId', '==', 'lot-c-door').get();
    expect(visits.size).toBe(1);
    expect(transportRefusals).toBeGreaterThanOrEqual(3);
    await expect(page.getByText('À jour', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('a demo footprint archive is partial and deleting a lazy chunk invalidates readiness @emulator', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem('athar.trusted-device', 'true'));
  // Absent main archive is served as HTML 200 by the SPA: the worker must reject it.
  await rm(fullArchive, { force: true });
  try {
    await signIn(page);
    await page.getByRole('button', { name: 'Préparer hors ligne', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Préparer Zone de recette C hors ligne' });
    await dialog.getByRole('button', { name: 'Télécharger et vérifier la zone' }).click();
    await expect(dialog.getByText('Préparation à compléter', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(dialog).toContainText('Emprises de démonstration uniquement');
    await expect(dialog.getByText('Zone disponible hors ligne', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith('athar-shell-')) continue;
        const cache = await caches.open(name);
        const chunk = (await cache.keys()).find(request => request.url.includes('chunk-WorkspaceMap-') && request.url.endsWith('.js'));
        if (chunk) await cache.delete(chunk);
      }
    });
    await page.getByRole('button', { name: 'Préparer hors ligne', exact: true }).click();
    await expect(dialog).toContainText('Interface incomplète');
  } finally { await writeFile(fullArchive, await readFile('public/fixtures/batiments-carmes.pmtiles')); }
});

test('preparation requires a trusted device and reports a storage refusal without success @emulator', async ({ page, context }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Préparer hors ligne', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Préparer Zone de recette C hors ligne' });
  await expect(dialog.getByRole('button', { name: 'Télécharger et vérifier la zone' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Cet appareil est personnel et de confiance' }).check();
  await dialog.getByRole('button', { name: 'Activer et recharger Athar' }).click();
  await expect(page.getByRole('button', { name: address })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    const original = Cache.prototype.put;
    Cache.prototype.put = function(request, response) {
      if (String(request).endsWith('.pmtiles')) return Promise.reject(new DOMException('Quota exceeded', 'QuotaExceededError'));
      return original.call(this, request, response);
    };
  });
  await page.getByRole('button', { name: 'Préparer hors ligne', exact: true }).click();
  await dialog.getByRole('button', { name: 'Télécharger et vérifier la zone' }).click();
  await expect(dialog.getByText('Préparation incomplète', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText('Espace insuffisant');
  await expect(dialog.getByText('Zone disponible hors ligne', { exact: true })).toHaveCount(0);
});

test('a failed local save remains visible in the zone and can be retried @emulator', async ({ page, context }) => {
  await signIn(page);
  await page.getByRole('button', { name: address }).click();
  await page.getByRole('button', { name: 'Porte 01, Pas encore fait' }).click();
  await context.setOffline(true);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    Object.assign(window, { restoreAtharWrites: () => { IDBObjectStore.prototype.add = original; } });
    IDBObjectStore.prototype.add = function(value, key) {
      if (this.name === 'entries') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: 'Absent', exact: true }).click();
  await expect(page.getByText('Saisie non enregistrée', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Fiche de la porte 01' }).getByRole('button', { name: /12 rue de l’Église/ }).click();
  await page.getByRole('button', { name: 'Retour à la zone' }).click();
  await expect(page.getByLabel('Sauvegarde des passages')).toContainText('Saisie non enregistrée');
  expect((await workspace.collection('doors').doc('lot-c-door').get()).get('revision')).toBe(0);
  await page.evaluate(() => (window as unknown as { restoreAtharWrites(): void }).restoreAtharWrites());
  await page.getByRole('button', { name: 'Reprendre la saisie' }).click();
  await page.getByRole('button', { name: 'Porte 01, Pas encore fait' }).click();
  await page.getByRole('button', { name: 'Absent', exact: true }).click();
  await expect(page.getByText('Porte 01 : passage enregistré sur l’appareil.')).toBeVisible();
  await context.setOffline(false);
  await expect.poll(async () => (await workspace.collection('doors').doc('lot-c-door').get()).get('revision'), { timeout: 20_000 }).toBe(1);
});
