import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

function countMapPixels(screenshot: Buffer) {
  const png = PNG.sync.read(screenshot);
  const colors = new Map<string, number>();
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index + 3] < 250) continue;
    const color = `${png.data[index]},${png.data[index + 1]},${png.data[index + 2]}`;
    colors.set(color, (colors.get(color) ?? 0) + 1);
  }
  const counts = [...colors.values()].sort((left, right) => right - left);
  return { dominant: counts[0] ?? 0, significantColors: counts.filter((count) => count >= 100).length, total: png.width * png.height };
}

test('keeps the prepared local map asset and app shell available offline', async ({ page, context }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('ERR_INTERNET_DISCONNECTED')) consoleErrors.push(message.text());
  });
  await page.goto('/technical-lab');
  await expect(page.getByRole('heading', { name: 'Socle technique' })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Reseau disponible' }).click();
  await page.getByRole('button', { name: 'Absent' }).click();
  await expect(page.locator('.sync-message')).toHaveText('Changement en attente');
  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('athar-prototype-outbox');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const entries = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction('entries').objectStore('entries').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return entries.length;
  })).toBe(1);

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await new Promise<void>((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => event.data?.ok ? resolve() : reject(new Error(event.data?.error ?? 'Map preparation failed'));
      registration.active?.postMessage({ type: 'PREPARE_TOULOUSE_MAP' }, [channel.port2]);
    });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Socle technique' })).toBeVisible();
  await page.getByRole('button', { name: 'Synchroniser maintenant' }).click();
  await expect(page.locator('.sync-message')).toHaveText('Synchronise');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const preparedAssetIsCached = await page.evaluate(async () => {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      if (requests.some((request) => new URL(request.url).pathname === '/fixtures/toulouse.pmtiles')) {
        return true;
      }
    }
    return false;
  });
  expect(preparedAssetIsCached).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Socle technique' })).toBeVisible();
  await expect(page.getByLabel('Carte MapLibre de test')).toBeVisible();
  await expect(page.evaluate(async () => {
    const response = await fetch('/fixtures/toulouse.pmtiles', { headers: { Range: 'bytes=0-126' } });
    return { status: response.status, length: (await response.arrayBuffer()).byteLength };
  })).resolves.toEqual({ status: 206, length: 127 });
  const canvas = page.locator('.maplibregl-canvas');
  await expect.poll(() => consoleErrors).toEqual([]);
  await expect(page.getByLabel('Carte MapLibre de test')).toHaveAttribute('data-archive-ready', 'true');
  await expect.poll(async () => Number(await page.getByLabel('Carte MapLibre de test').getAttribute('data-center-tile-bytes'))).toBeGreaterThan(1_000);
  await expect(page.getByLabel('Carte MapLibre de test')).toHaveAttribute('data-map-ready', 'true');
  await expect.poll(async () => {
    if (consoleErrors.length > 0) throw new Error(consoleErrors.join('\n'));
    return Number(await page.getByLabel('Carte MapLibre de test').getAttribute('data-rendered-features'));
  }, { timeout: 15_000 }).toBeGreaterThan(100);
  await expect.poll(async () => countMapPixels(await canvas.screenshot()).significantColors, { timeout: 15_000 }).toBeGreaterThan(8);
  const renderedPixels = countMapPixels(await canvas.screenshot());
  expect(renderedPixels.dominant).toBeLessThan(renderedPixels.total * 0.97);
  expect(consoleErrors).toEqual([]);
  console.log('Offline map metrics', {
    renderedFeatures: Number(await page.getByLabel('Carte MapLibre de test').getAttribute('data-rendered-features')),
    ...renderedPixels
  });
});
