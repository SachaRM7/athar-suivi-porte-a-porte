import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function openBuilding(page: Page) {
  // Ce parcours vérifie la fiche, y compris dans le navigateur sans WebGL de l'agent.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type === 'webgl2' || type === 'webgl' ? null : original.call(this, type, ...args);
    } as typeof original;
  });
  await page.goto('/technical-map?fixture=building-layout');
  await page.locator('.building-row').first().click();
  await expect(page.locator('.door-row')).toHaveCount(16);
  await page.evaluate(() => document.fonts.ready);
  return page.getByRole('dialog', { name: 'Detail du batiment', exact: true });
}

for (const viewport of [{ width: 390, height: 664 }, { width: 320, height: 568 }]) {
  test(`les portes sont visibles dès l'ouverture à ${viewport.width} × ${viewport.height}, avec halls et synchronisation`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const sheet = await openBuilding(page);
    const firstDoor = sheet.getByRole('button', { name: 'Porte 31, Contact établi', exact: true });
    // toBeVisible seul ne détecte pas une porte masquée par un parent ou le pied fixe.
    // Aucune action ne doit faire défiler la fiche avant cette vérification.
    await expect(firstDoor).toBeInViewport({ ratio: 1 });
    expect(await firstDoor.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return [rect.top + 4, rect.bottom - 4].every(y => element.contains(document.elementFromPoint(rect.x + rect.width / 2, y)));
    })).toBe(true);

    await firstDoor.click();
    const detail = page.getByRole('dialog', { name: 'Fiche de la porte 31', exact: true });
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(firstDoor).toBeFocused();

    const nextDoors = sheet.getByRole('button', { name: 'Portes suivantes, Portes RDC', exact: true });
    await nextDoors.scrollIntoViewIfNeeded();
    await nextDoors.click();
    const lastDoor = sheet.getByRole('button', { name: 'Porte 04, Pas encore fait', exact: true });
    await expect(lastDoor).toBeInViewport({ ratio: 1 });
    await expect(sheet.getByRole('heading', { name: 'Bâtiment building-dalbad', exact: true })).not.toBeInViewport();
    await lastDoor.click();
    await page.getByRole('dialog', { name: 'Fiche de la porte 04', exact: true }).getByRole('button', { name: 'Absent', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Fiche de la porte 04', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Porte 04, Absent', exact: true })).toBeVisible();

    const synchronize = sheet.getByRole('button', { name: 'Synchroniser', exact: true });
    await synchronize.scrollIntoViewIfNeeded();
    await expect(synchronize).toBeInViewport({ ratio: 1 });
    await synchronize.click();
    await expect(sheet.getByLabel('Appareil de confiance')).toBeInViewport({ ratio: 1 });
    await expect(sheet.locator('.door-row')).toHaveCount(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await sheet.getByRole('button', { name: 'Fermer la fiche du bâtiment', exact: true }).click();
    await expect(sheet).toHaveCount(0);
  });
}

test('texte à 200 % : les halls, portes et commandes restent accessibles sur 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const sheet = await openBuilding(page);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  const selector = sheet.getByRole('combobox', { name: 'Bâtiment / hall', exact: true });
  await selector.selectOption('d0');
  await expect(sheet.getByRole('heading', { name: 'D0', exact: true })).toBeVisible();
  await selector.selectOption('main');
  const door = sheet.getByRole('button', { name: 'Porte 31, Contact établi', exact: true });
  await door.scrollIntoViewIfNeeded();
  await expect(door).toBeInViewport({ ratio: 1 });
  await door.click();
  const action = page.getByRole('dialog', { name: 'Fiche de la porte 31', exact: true }).getByRole('button', { name: 'Absent', exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport({ ratio: 1 });
  await action.click();
  await expect(page.getByRole('dialog', { name: 'Fiche de la porte 31', exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Porte 31, Absent', exact: true })).toBeVisible();
  const synchronize = sheet.getByRole('button', { name: 'Synchroniser', exact: true });
  await synchronize.scrollIntoViewIfNeeded();
  await expect(synchronize).toBeInViewport({ ratio: 1 });
  await synchronize.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const close = sheet.getByRole('button', { name: 'Fermer la fiche du bâtiment', exact: true });
  const box = await close.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(sheet).toHaveCount(0);
});
