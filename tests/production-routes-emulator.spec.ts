import { expect, test } from '@playwright/test';

/**
 * Lot A4 — sur le build de production (celui des parcours @emulator), aucun laboratoire
 * n'est joignable : ni en accès direct, ni après actualisation, ni connecté.
 */
const TECHNICAL_PATHS = ['/_ds', '/technical-lab', '/technical-map'];

for (const path of TECHNICAL_PATHS) {
  test(`anonymous access to ${path} lands on the private login, never on a lab @emulator`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Reprendre là où la zone s’est arrêtée.' })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/login$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Reprendre là où la zone s’est arrêtée.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Laboratoire|Design system|Parcours carte/i)).toHaveCount(0);
  });
}

test('a signed-in member typing a lab URL stays in the private workspace @emulator', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail ou identifiant').fill('terrain.31');
  await page.getByLabel('Mot de passe').fill('Temporary-password-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible({ timeout: 20_000 });
  for (const path of TECHNICAL_PATHS) {
    await page.goto(path);
    await expect(page).toHaveURL(/127\.0\.0\.1:5274\/$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible({ timeout: 20_000 });
  }
  const assets = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(assets.filter((name) => /TechnicalLab|MapPreview|DesignSystemPage/.test(name))).toEqual([]);
});
