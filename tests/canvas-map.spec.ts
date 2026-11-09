import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function disableWebGL(page: Page, mapOnly = false): Promise<void> {
  await page.addInitScript((mapOnly: boolean) => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if ((type === 'webgl2' || type === 'webgl') && (!mapOnly || this.classList.contains('maplibregl-canvas'))) return null;
      return original.call(this, type, ...args);
    } as typeof original;
  }, mapOnly);
}

async function openCanvas(page: Page): Promise<void> {
  await page.goto('/technical-map');
  await expect(page.getByLabel('Carte des zones sans WebGL')).toHaveAttribute('data-basemap-ready', 'true', { timeout: 20000 });
  await expect(page.locator('[data-rnb-id="PG31CARMES002"]')).not.toHaveCount(0);
  await expect(page.locator('.building-row')).toHaveCount(2);
  await expect(page.getByLabel('État de la carte')).toBeHidden();
}

test('without WebGL, the local map loads automatically and a listed door can be marked', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page);
  await openCanvas(page);
  await page.locator('.building-row').filter({ hasText: '18 rue du Languedoc' }).click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Porte 11, Contact établi' }).click();
  await page.getByRole('button', { name: 'Absent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Porte 11, Absent' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Marquer une porte' })).toBeVisible();
  await page.getByRole('button', { name: 'Marquer une porte' }).click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a map-specific GPU allocation failure also falls back, even when the capability probe succeeds', async ({ page }) => {
  await disableWebGL(page, true);
  await openCanvas(page);
  await page.locator('.building-row').first().click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
});

test('an unrecorded RNB footprint opens its empty sheet and creates nothing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await disableWebGL(page);
  await openCanvas(page);
  const footprint = page.locator('[data-rnb-id="PG31CARMES002"]').first();
  // Choose the actual SVG footprint; no pixel guessing or hidden forced click.
  await footprint.click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bâtiment non décrit' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.building-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Zoom arrière' }).click();
  await expect(page.locator('[data-rnb-id]')).toHaveCount(0);
});

test('losing WebGL keeps the viewport and the building sheet while switching to Canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/technical-map');
  const original = page.getByLabel('Carte MapLibre des zones');
  await expect(original).toHaveAttribute('data-footprints', /^[1-9]/, { timeout: 20000 });
  await page.locator('.building-row').filter({ hasText: '18 rue du Languedoc' }).click();
  await expect.poll(async () => {
    const bounds = JSON.parse((await original.getAttribute('data-viewport'))!);
    return bounds.east - bounds.west;
  }).toBeLessThan(0.0033);
  const before = JSON.parse((await original.getAttribute('data-viewport'))!);
  await page.locator('.maplibregl-canvas').dispatchEvent('webglcontextlost');
  const fallback = page.getByLabel('Carte des zones sans WebGL');
  await expect(fallback).toHaveAttribute('data-basemap-ready', 'true', { timeout: 20000 });
  await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
  const after = JSON.parse((await fallback.getAttribute('data-viewport'))!);
  expect(after.east - after.west).toBeCloseTo(before.east - before.west, 4);
  expect((after.east + after.west) / 2).toBeCloseTo((before.east + before.west) / 2, 4);
  expect((after.north + after.south) / 2).toBeCloseTo((before.north + before.south) / 2, 4);
  await page.keyboard.press('Escape');
  await page.locator('.building-row').first().click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
});

test('a missing basemap never blocks the list and retry recovers without WebGL', async ({ page }) => {
  await disableWebGL(page);
  await page.route('**/fixtures/toulouse.pmtiles', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/technical-map');
  await expect(page.getByRole('button', { name: 'Réessayer la carte' })).toBeVisible();
  await page.locator('.building-row').first().click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.unroute('**/fixtures/toulouse.pmtiles');
  await page.getByRole('button', { name: 'Réessayer la carte' }).click();
  await expect(page.getByLabel('Carte des zones sans WebGL')).toHaveAttribute('data-basemap-ready', 'true', { timeout: 20000 });
  await expect(page.getByLabel('État de la carte')).toBeHidden();
});

test.describe('prepared offline map', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the Canvas module, basemap and RNB footprints survive an offline reload', async ({ page, context }) => {
    await disableWebGL(page);
    await openCanvas(page);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await new Promise<void>((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => event.data?.ok ? resolve() : reject(new Error(event.data?.error));
        registration.active?.postMessage({ type: 'PREPARE_TOULOUSE_MAP' }, [channel.port2]);
      });
    });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByLabel('Carte des zones sans WebGL')).toHaveAttribute('data-basemap-ready', 'true', { timeout: 20000 });
    await expect(page.locator('[data-rnb-id="PG31CARMES002"]')).not.toHaveCount(0);
    await expect(page.getByLabel('État de la carte')).toBeHidden();
    await page.locator('.building-row').first().click();
    await expect(page.getByRole('dialog', { name: 'Detail du batiment', exact: true })).toBeVisible();
  });
});
