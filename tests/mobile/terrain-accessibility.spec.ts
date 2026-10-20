import { expect, test } from '@playwright/test';
// Le test de panne doit atteindre le réseau, sans réponse du cache du service worker.
test.use({ serviceWorkers: 'block' });

test('nested sheets trap focus, restore it and close one level at a time', async ({ page }) => {
  await page.goto('/technical-map');
  const building = page.locator('.building-row').first();
  await building.click();
  const sheet = page.getByRole('dialog', { name: 'Detail du batiment', exact: true });
  await expect(sheet).toBeVisible();
  const door = sheet.getByRole('button', { name: /^Porte / }).first(); await door.click();
  const detail = page.getByRole('dialog', { name: /^Fiche de la porte/ });
  await expect(detail).toBeFocused();
  for (let index = 0; index < 25; index++) {
    await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
    expect(await detail.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape'); await expect(detail).toHaveCount(0); await expect(sheet).toBeVisible(); await expect(door).toBeFocused();
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0); await expect(building).toBeFocused();
});

test('position is requested explicitly and watcher released after a fix', async ({ page }) => {
  await page.addInitScript(() => {
    const stats = { watches: 0, clears: 0, highAccuracy: false };
    Object.assign(window, { gpsTest: stats });
    Object.defineProperty(navigator, 'geolocation', { value: {
      watchPosition(success: PositionCallback, _failure: PositionErrorCallback, options: PositionOptions) {
        stats.watches++; stats.highAccuracy = options.enableHighAccuracy ?? false;
        setTimeout(() => success({ coords: { latitude: 43.606, longitude: 1.4454, accuracy: 30 } } as GeolocationPosition), 20); return 1;
      }, clearWatch() { stats.clears++; }
    } });
  });
  await page.goto('/technical-map'); await expect(page.locator('.building-row').first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { gpsTest: { watches: number } }).gpsTest.watches)).toBe(0);
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { gpsTest: object }).gpsTest)).toEqual({ watches: 1, clears: 1, highAccuracy: false });
  await expect(page.getByRole('button', { name: 'Ma position', exact: true })).toBeEnabled();
});

test('320px and enlarged text keep the door actions reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/technical-map'); await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  await page.locator('.building-row').first().click();
  await page.getByRole('button', { name: /^Porte / }).first().click();
  const detail = page.getByRole('dialog', { name: /^Fiche de la porte/ });
  const action = detail.getByRole('button', { name: 'Absent', exact: true });
  await action.scrollIntoViewIfNeeded();
  const box = await action.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await action.click(); await expect(detail).toHaveCount(0);
});

test('map resource failure leaves buildings usable and offers a retry', async ({ page }) => {
  await page.route('**/fixtures/toulouse.pmtiles', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/technical-map');
  await expect(page.locator('.building-row').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Réessayer la carte' })).toBeVisible({ timeout: 25000 });
  await page.locator('.building-row').first().click(); await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.unroute('**/fixtures/toulouse.pmtiles');
  await page.getByRole('button', { name: 'Réessayer la carte' }).click();
  await expect.poll(async () => Number(await page.getByLabel('Carte MapLibre des zones').getAttribute('data-footprints'))).toBeGreaterThan(0);
});
