import { expect, test } from '@playwright/test';

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
  await expect(page.getByRole('dialog', { name: 'Statut pour porte 11' })).toBeVisible();
  await page.getByRole('button', { name: 'Marquer porte 11: A revenir' }).click();
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
