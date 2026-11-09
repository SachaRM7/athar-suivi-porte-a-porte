import { expect, test } from '@playwright/test';

test('a phone without WebGL opens doors and follows its position on the local Canvas map', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type === 'webgl2' || type === 'webgl' ? null : original.call(this, type, ...args);
    } as typeof original;
    const stats = { watches: 0, clears: 0 };
    Object.assign(window, { gpsTest: stats });
    Object.defineProperty(navigator, 'geolocation', { value: {
      watchPosition(success: PositionCallback) {
        stats.watches++;
        setTimeout(() => success({ coords: { latitude: 43.6105, longitude: 1.4525, accuracy: 12 } } as GeolocationPosition), 20);
        return 1;
      }, clearWatch() { stats.clears++; }
    } });
  });
  await page.goto('/technical-map');
  const map = page.getByLabel('Carte des zones sans WebGL');
  await expect(map).toHaveAttribute('data-basemap-ready', 'true', { timeout: 20000 });
  await page.locator('.building-row').first().click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const stats = () => page.evaluate(() => (window as unknown as { gpsTest: { watches: number; clears: number } }).gpsTest);
  expect(await stats()).toEqual({ watches: 0, clears: 0 });
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect.poll(async () => {
    const bounds = JSON.parse((await map.getAttribute('data-viewport')) ?? '{}');
    return bounds.west < 1.4525 && bounds.east > 1.4525 && bounds.south < 43.6105 && bounds.north > 43.6105;
  }).toBe(true);
  await page.getByRole('button', { name: 'Arrêter le suivi de ma position' }).click();
  await expect.poll(stats).toEqual({ watches: 1, clears: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
