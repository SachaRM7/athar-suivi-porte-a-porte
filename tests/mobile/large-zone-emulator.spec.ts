import { expect, test } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint } from 'firebase-admin/firestore';
import { geohashForLocation } from 'geofire-common';

// Fixtures isolées : aucune adresse réelle et jamais un projet cloud.
const app = initializeApp({ projectId: 'athar-local' }, 'lot-d-browser');
const db = getFirestore(app);
const workspace = db.doc('workspaces/main');
const zoneId = 'lot-d-pagination';
test.beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180') throw new Error('Emulator-only test.');
  const batch = db.batch();
  batch.set(workspace.collection('zones').doc(zoneId), {
    name: 'Recette grande zone D', color: '#16835F', coverageState: 'active', assigneeLabel: null,
    bbox: { north: 43.608, south: 43.6052, east: 1.451, west: 1.443 },
    geometry: { type: 'Polygon', vertices: [
      { latitude: 43.6052, longitude: 1.443 }, { latitude: 43.6052, longitude: 1.451 },
      { latitude: 43.608, longitude: 1.451 }, { latitude: 43.608, longitude: 1.443 }, { latitude: 43.6052, longitude: 1.443 }
    ] }
  });
  for (let index = 0; index < 276; index++) {
    const label = String(index).padStart(3, '0');
    batch.set(workspace.collection('buildings').doc(`lot-d-${label}`), {
      addressLabel: `Adresse de recette ${label}`, location: new GeoPoint(43.606, 1.4454), geohash: geohashForLocation([43.606, 1.4454]),
      zoneId, createdBy: 'admin-1', structureRevision: 0
    });
  }
  await batch.commit();
});
test.afterAll(async () => { await db.terminate(); });

test('276 buildings stay accessible in bounded pages, including after closing a sheet @emulator', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail ou identifiant').fill('terrain.31');
  await page.getByLabel('Mot de passe').fill('Temporary-password-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: /Zones de Toulouse|Choisis la zone/ })).toBeVisible({ timeout: 20000 });
  await page.goto(`/?zone=${zoneId}`);
  await expect(page.locator('.building-row')).toHaveCount(25, { timeout: 20000 });
  await expect(page.locator('.terrain-page-scope')).toContainText('page');
  for (let index = 1; index <= 11; index++) {
    await page.getByRole('button', { name: 'Suivante', exact: true }).click();
    await expect(page.locator('.building-row')).toHaveCount(index === 11 ? 1 : 25);
    await expect(page.locator('.terrain-pagination')).toContainText(`Page ${index + 1}`);
  }
  const last = page.getByRole('button', { name: /^Adresse de recette 275/ });
  await last.click();
  await expect(page.getByRole('heading', { name: 'Bâtiment non décrit' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(last).toBeVisible(); await expect(page.locator('.terrain-pagination')).toContainText('Page 12');
  await page.getByRole('button', { name: 'Précédente', exact: true }).click(); await expect(page.locator('.building-row')).toHaveCount(25);
  await expect(page.getByRole('button', { name: /^Adresse de recette 250/ })).toBeVisible();
});
