import { expect, test, type Page } from '@playwright/test';

async function openBuilding(page: Page) {
  await page.goto('/technical-map');
  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  await expect(page.getByRole('button', { name: 'Porte 11, Contact établi', exact: true })).toBeVisible();
}

async function addSection(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Ajouter un bâtiment / hall', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter un bâtiment / hall', exact: true });
  await dialog.getByRole('textbox', { name: 'Nom du bâtiment / hall' }).fill(name);
  await dialog.getByRole('button', { name: 'Ajouter le bâtiment / hall', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function addDoor(page: Page, label: string, building?: string) {
  await page.getByRole('button', { name: /^(\+ )?Ajouter une porte$/, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter une porte', exact: true });
  await dialog.getByRole('textbox', { name: 'Numéro de porte' }).fill(label);
  await dialog.getByRole('button', { name: building ? `Ajouter à ${building}` : 'Ajouter la porte', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Porte ${label}, Pas encore fait`, exact: true })).toBeVisible();
}

test('un bâtiment unique garde son suivi, sans compartiment imposé', async ({ page }) => {
  await openBuilding(page);
  await expect(page.getByRole('group', { name: 'Bâtiments / halls à cette adresse' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Bâtiment / hall', exact: true })).toHaveCount(0);
  await expect(page.getByText('Bâtiment A', { exact: true })).toHaveCount(0);
  const doorCount = await page.locator('.door-row').count();
  await page.getByRole('button', { name: '+ Ajouter un bâtiment / hall', exact: true }).click();
  await page.getByRole('button', { name: 'Fermer la configuration', exact: true }).last().click();
  await expect(page.locator('.door-row')).toHaveCount(doorCount);
  await expect(page.getByText('Bâtiment A', { exact: true })).toHaveCount(0);
});

test('A01 garde un historique indépendant dans chaque bâtiment et la structure reste isolée', async ({ page }) => {
  await openBuilding(page);
  await addDoor(page, 'A01');
  await addSection(page, 'Bâtiment B');
  await addDoor(page, 'A01', 'Bâtiment B');
  await page.getByRole('button', { name: 'Porte A01, Pas encore fait', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Fiche de la porte A01', exact: true });
  await expect(detail.getByText('Bâtiment B · RDC · A01', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Absent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Porte A01, Absent', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bâtiment A', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Porte A01, Pas encore fait', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Porte 11, Contact établi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Porte A01, Pas encore fait', exact: true }).click();
  await expect(page.getByText('Aucun passage enregistré.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await addSection(page, 'Bâtiment C');
  await page.getByRole('button', { name: 'Décrire le bâtiment' }).click();
  const structure = page.getByRole('dialog', { name: 'Configurer le batiment', exact: true });
  await expect(structure.getByRole('heading', { name: 'Structure — Bâtiment C', exact: true })).toBeVisible();
  await structure.getByRole('button', { name: /Créer \d+ portes dans Bâtiment C/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bâtiment B', exact: true }).click();
  await expect(page.locator('.door-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Porte A01, Absent', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer la fiche du bâtiment', exact: true }).click();
  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  await page.getByRole('button', { name: 'Bâtiment B', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Porte A01, Absent', exact: true })).toBeVisible();
});

test('quinze halls restent accessibles dans un sélecteur compact sur mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openBuilding(page);
  for (let number = 2; number <= 15; number++) await addSection(page, `Hall ${number}`);
  const selector = page.getByRole('combobox', { name: 'Bâtiment / hall', exact: true });
  await expect(selector.locator('option')).toHaveCount(15);
  await selector.selectOption({ label: 'Hall 2' });
  await addDoor(page, 'A01', 'Hall 2');
  await selector.selectOption({ label: 'Hall 15' });
  await expect(page.locator('.door-row')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Hall 15', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await selector.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});
