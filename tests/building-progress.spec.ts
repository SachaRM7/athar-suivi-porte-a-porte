import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('la carte distingue une emprise intacte, sa préparation et son premier passage', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type === 'webgl2' || type === 'webgl' ? null : original.call(this, type, ...args);
    } as typeof original;
  });
  await page.goto('/technical-map');
  const id = 'PG31CARMES002';
  const footprint = page.locator(`[data-rnb-id="${id}"]`).first();
  const counter = page.locator(`[data-building-progress="${id}"]`);
  await expect(footprint).toBeVisible();
  await expect(counter).toHaveCount(0);
  await footprint.click();
  await page.getByRole('button', { name: "C'est un pavillon — une seule porte", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Porte 01, Pas encore fait', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer la fiche du bâtiment', exact: true }).click();
  await expect(counter).toHaveText('0/1');
  await expect(footprint).toHaveAttribute('stroke', '#16324F');
  await expect(footprint).toHaveAttribute('stroke-dasharray', '6 4');
  const row = page.locator('.building-row').filter({ hasText: `Bâtiment ${id}` });
  await expect(row).toHaveAttribute('data-progress', 'prepared');
  await row.click();
  await page.getByRole('button', { name: 'Porte 01, Pas encore fait', exact: true }).click();
  await page.getByRole('button', { name: 'Absent', exact: true }).click();
  await expect(page.locator('.building-floor-revisit')).toHaveText('1 à revoir');
  await page.getByRole('button', { name: 'Fermer la fiche du bâtiment', exact: true }).click();
  await expect(counter).toHaveText('1/1');
  await expect(footprint).toHaveAttribute('stroke', '#C87A0A');
  await expect(footprint).not.toHaveAttribute('stroke-dasharray', /.+/);
  await expect(row).toHaveAttribute('data-progress', 'visited');
  await expect(row).toContainText('Toutes visitées');
  expect(errors).toEqual([]);
});

test('le compteur sur la carte garde tous les halls même en quittant un hall vide', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type === 'webgl2' || type === 'webgl' ? null : original.call(this, type, ...args);
    } as typeof original;
  });
  await page.goto('/technical-map?fixture=building-layout');
  await page.locator('.building-row').first().click();
  await page.getByRole('combobox', { name: 'Bâtiment / hall', exact: true }).selectOption('d0');
  await expect(page.getByRole('heading', { name: 'D0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer la fiche du bâtiment', exact: true }).click();
  await expect(page.locator('[data-building-progress="building-dalbad"]')).toHaveText('2/16');
  await expect(page.locator('.building-row').first()).toHaveAttribute('data-progress', 'started');
});
