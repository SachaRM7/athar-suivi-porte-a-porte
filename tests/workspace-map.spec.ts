import { expect, test, type Page } from '@playwright/test';

/**
 * Emprises de l'échantillon `public/fixtures/batiments-carmes.pmtiles`, servi par la route
 * de régression. Le tuileset départemental de WP6 vit hors de Git.
 */
const FOOTPRINTS = {
  suivi: { longitude: 1.4454, latitude: 43.6058 },        // building-dalbad, document Firestore
  todo: { longitude: 1.447, latitude: 43.6065 },          // PG31CARMES002, aucun document
  horsZone: { longitude: 1.4415, latitude: 43.6065 },     // PG31HORS0001, hors du polygone
  vide: { longitude: 1.4448, latitude: 43.607 }           // aucune emprise
};

function mercator(latitude: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
}

/** Projette une position sur le canevas MapLibre, qui est à plat et sans rotation. */
async function clickOnMap(page: Page, target: { longitude: number; latitude: number }): Promise<void> {
  const surface = page.getByLabel('Carte MapLibre des zones');
  const viewport = JSON.parse((await surface.getAttribute('data-viewport')) ?? '{}') as { north: number; south: number; east: number; west: number };
  const canvas = await page.locator('.maplibregl-canvas').boundingBox();
  if (!canvas) throw new Error('Le canevas MapLibre est absent.');
  const x = canvas.x + ((target.longitude - viewport.west) / (viewport.east - viewport.west)) * canvas.width;
  const y = canvas.y + ((mercator(viewport.north) - mercator(target.latitude)) / (mercator(viewport.north) - mercator(viewport.south))) * canvas.height;
  expect(x, 'la cible doit être dans le cadre').toBeGreaterThan(canvas.x);
  expect(x).toBeLessThan(canvas.x + canvas.width);
  expect(y).toBeGreaterThan(canvas.y);
  expect(y).toBeLessThan(canvas.y + canvas.height);
  await page.mouse.click(x, y);
}

async function openFieldMap(page: Page): Promise<void> {
  await page.goto('/technical-map');
  await expect.poll(() => page.getByText('2 batiment(s) visibles').isVisible(), { timeout: 15_000 }).toBe(true);
  // Les sept emprises de l'échantillon doivent être tuilées avant tout appui sur la carte.
  await expect.poll(
    async () => Number((await page.getByLabel('Carte MapLibre des zones').getAttribute('data-footprints')) ?? '0'),
    { timeout: 20_000 }
  ).toBe(7);
}

test('draws and saves an editable local zone over the prepared MapLibre package', async ({ page }) => {
  await page.goto('/technical-map');
  await expect(page.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible();
  await expect(page.getByLabel('Carte MapLibre des zones')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(() => page.getByText('2 batiment(s) visibles').isVisible(), { timeout: 15_000 }).toBe(true);

  await page.getByRole('button', { name: 'Modifier la zone' }).click();
  await expect(page.getByText('Edition de Carmes. Ajustez le contour, le nom ou la couleur.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Nom de la zone' }).fill('Carmes centre');
  await page.getByLabel('Couleur de la zone').fill('#D8A200');
  await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
  await expect(page.getByText(/Zone enregistree\. 2 batiment\(s\) rattache\(s\) par point-dans-polygone\./)).toBeVisible();
  await expect(page.getByText('2 rattache(s)')).toBeVisible();

  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '18 rue du Languedoc, Toulouse' })).toBeVisible();
  await page.getByRole('button', { name: 'Porte 11, Contact' }).click();
  await expect(page.getByRole('dialog', { name: 'Fiche de la porte 11' })).toBeVisible();
  await page.getByRole('button', { name: 'Absent', exact: true }).click();
  await expect(page.getByText(/Porte 11: passage .* cree, revision 2\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Porte 11, A revenir' })).toBeVisible();

  await page.getByRole('button', { name: 'tout marquer absent' }).first().click();
  await expect(page.getByText('1 passage(s) « Absent » enregistres pour cet etage.')).toBeVisible();
  await expect(page.getByText('2 attente(s)')).toBeVisible();

  await page.getByRole('button', { name: 'Configurer le batiment' }).click();
  await page.getByRole('button', { name: 'Ajustement manuel' }).click();
  const plan = page.getByRole('textbox', { name: 'Plan manuel de portes' });
  const originalPlan = await plan.inputValue();
  await plan.fill(originalPlan.replace('1 | 12 | door-dalbad-12', '1 | 12A | door-dalbad-12'));
  await page.getByRole('button', { name: 'Appliquer le plan manuel' }).click();
  await expect(page.getByText('Structure bloquee: synchronisez ou resolvez les passages locaux des portes concernees.')).toBeVisible();

  await plan.fill(`${originalPlan}\n2 | 21`);
  await page.getByRole('button', { name: 'Appliquer le plan manuel' }).click();
  await expect(page.getByText('Structure enregistree: 1 ajoutee(s), 0 ajustee(s), 0 archivee(s).')).toBeVisible();
  await expect(page.getByText('5 portes')).toBeVisible();
});

test('opens the building detail as a constrained desktop dialog', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('/technical-map');
  await expect.poll(() => page.getByText('2 batiment(s) visibles').isVisible(), { timeout: 15_000 }).toBe(true);
  const mapBounds = await page.getByLabel('Carte MapLibre des zones').boundingBox();
  expect(mapBounds?.y).toBeLessThan(350);
  expect(mapBounds?.height).toBeGreaterThan(400);
  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  const dialog = page.getByRole('dialog', { name: 'Detail du batiment' });
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())?.width).toBeLessThanOrEqual(820);
  await page.close();
});

test('opens a detected building that has no Firestore document on its empty state', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  await clickOnMap(page, FOOTPRINTS.todo);
  const dialog = page.getByRole('dialog', { name: 'Detail du batiment' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bâtiment PG31CARMES002' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bâtiment non décrit' })).toBeVisible();
  await expect(page.getByText('2 batiment(s) visibles')).toBeVisible();

  await page.getByRole('button', { name: 'Fermer le detail du batiment' }).click();
  await expect(dialog).toBeHidden();
  await page.close();
});

test('opens the tracked footprint on its recorded doors', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  await clickOnMap(page, FOOTPRINTS.suivi);
  await expect(page.getByRole('heading', { name: '18 rue du Languedoc, Toulouse' })).toBeVisible();
  await page.close();
});

test('creates nothing on an empty press or on a footprint outside the zone', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);
  const dialog = page.getByRole('dialog', { name: 'Detail du batiment' });

  await clickOnMap(page, FOOTPRINTS.vide);
  await expect(dialog).toBeHidden();

  await clickOnMap(page, FOOTPRINTS.horsZone);
  await expect(dialog).toBeHidden();
  await expect(page.getByText('2 batiment(s) visibles')).toBeVisible();
  await page.close();
});

test('hides individual footprints below zoom 16', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  await page.locator('.maplibregl-ctrl-zoom-out').click();
  await expect.poll(async () => {
    const viewport = JSON.parse((await page.getByLabel('Carte MapLibre des zones').getAttribute('data-viewport')) ?? '{}') as { east: number; west: number };
    return viewport.east - viewport.west;
  }, { timeout: 10_000 }).toBeGreaterThan(0.011);

  await clickOnMap(page, FOOTPRINTS.todo);
  await expect(page.getByRole('dialog', { name: 'Detail du batiment' })).toBeHidden();
  await page.close();
});

test('announces the manual placement mode and cancels without creating anything', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  await page.getByRole('button', { name: 'Ajouter un bâtiment' }).click();
  const hint = page.getByText('Touche la carte à l’emplacement exact du bâtiment');
  await expect(hint).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(hint).toBeHidden();
  await expect(page.getByText('Pose annulee. Rien n a ete cree.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Nouveau batiment' })).toBeHidden();

  await page.getByRole('button', { name: 'Ajouter un bâtiment' }).click();
  await clickOnMap(page, FOOTPRINTS.vide);
  await expect(page.getByRole('dialog', { name: 'Nouveau batiment' })).toBeVisible();
  await page.close();
});
