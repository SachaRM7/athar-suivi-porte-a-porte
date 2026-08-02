import { expect, test } from '@playwright/test';

test('draws and saves an editable local zone over the prepared MapLibre package', async ({ page }) => {
  await page.goto('/technical-map');
  await expect(page.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible();
  await expect(page.getByLabel('Carte MapLibre des zones')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(() => page.getByText('2 batiment(s) visibles').isVisible(), { timeout: 15_000 }).toBe(true);

  await page.getByRole('button', { name: 'Modifier la zone' }).click();
  await expect(page.getByText('Edition de Carmes. Deplacez les sommets puis enregistrez.')).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText(/Zone enregistree localement\. 2 batiment\(s\) rattache\(s\) par point-dans-polygone\./)).toBeVisible();
  await expect(page.getByText('2 rattache(s)')).toBeVisible();
});
