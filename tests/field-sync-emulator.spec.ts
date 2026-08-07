import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Identifiant').fill(username);
  await page.getByLabel('Mot de passe').fill('Temporary-password-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible({ timeout: 20_000 });
}

async function openDoor(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: '1 rue du Pilote, Toulouse' }).click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Porte 02, Pas visite' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Porte 02, Pas visite' }).click();
  await page.getByRole('button', { name: 'Marquer porte 02: A revenir' }).click();
}

async function prepareBuildingCache(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: '1 rue du Pilote, Toulouse' }).click();
  await expect(page.getByRole('button', { name: 'Porte 02, Pas visite' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Fermer le batiment' }).click();
}

async function waitForOfflineShell(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
}

async function outboxEntries(page: import('@playwright/test').Page, authorId: string) {
  return page.evaluate(async (uid) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('athar-prototype-outbox', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const entries = await new Promise<Array<{ commandId: string; authorId: string; state: string }>>((resolve, reject) => {
      const transaction = database.transaction('entries', 'readonly');
      const request = transaction.objectStore('entries').index('authorId').getAll(uid);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return entries;
  }, authorId);
}

async function serverDoorRevision(): Promise<number> {
  const response = await fetch('http://127.0.0.1:8180/v1/projects/athar-local/databases/(default)/documents/workspaces/main/doors/pilot-door-002', {
    headers: { Authorization: 'Bearer owner' }
  });
  if (!response.ok) throw new Error(`Firestore emulator returned ${response.status}.`);
  const body = await response.json() as { fields?: { revision?: { integerValue?: string } } };
  return Number(body.fields?.revision?.integerValue);
}

test('two terrain clients retain offline intentions and resolve a real Firestore revision conflict @emulator', async ({ browser }) => {
  test.setTimeout(120_000);
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await secondContext.addInitScript(() => {
    localStorage.setItem('athar.trusted-device', 'true');
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => localStorage.getItem('athar.test-firebase-offline') !== 'true'
    });
  });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await Promise.all([signIn(first, 'terrain.31'), signIn(second, 'terrain.b')]);
    await expect(first.getByRole('button', { name: '1 rue du Pilote, Toulouse' })).toBeVisible({ timeout: 15_000 });
    await expect(first.getByText('18 rue du Languedoc, Toulouse')).toHaveCount(0);
    await Promise.all([prepareBuildingCache(first), prepareBuildingCache(second)]);
    await waitForOfflineShell(second);
    await firstContext.setOffline(true);
    await secondContext.route(/127\.0\.0\.1:(8180|9199|5101)/, (route) => route.abort());
    await second.evaluate(() => {
      localStorage.setItem('athar.test-firebase-offline', 'true');
      window.dispatchEvent(new Event('offline'));
    });
    await Promise.all([openDoor(first), openDoor(second)]);

    await expect(first.getByText('Hors ligne')).toBeVisible();
    await expect(second.getByText('Hors ligne')).toBeVisible();
    const pendingBeforeReload = await outboxEntries(second, 'member-b');
    expect(pendingBeforeReload).toHaveLength(1);

    await second.reload();
    await expect(second.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => outboxEntries(second, 'member-b')).toEqual(pendingBeforeReload);
    await second.getByRole('button', { name: '1 rue du Pilote, Toulouse' }).click();
    await expect(second.getByRole('button', { name: 'Porte 02, A revenir' })).toBeVisible({ timeout: 15_000 });

    await firstContext.setOffline(false);
    await first.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(first.getByText('A jour', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(serverDoorRevision).toBe(1);
    await expect.poll(async () => outboxEntries(second, 'member-b')).toEqual(pendingBeforeReload);

    await secondContext.unroute(/127\.0\.0\.1:(8180|9199|5101)/);
    await second.evaluate(() => {
      localStorage.setItem('athar.test-firebase-offline', 'false');
      window.dispatchEvent(new Event('online'));
    });
    const resolution = second.getByLabel('Resolution du conflit');
    await expect(resolution).toBeVisible({ timeout: 15_000 });
    await expect(resolution.getByText(/Serveur : statut retry, revision 1\./)).toBeVisible();

    await second.getByRole('button', { name: 'Reappliquer' }).click();
    await expect(second.getByText('A jour', { exact: true })).toBeVisible({ timeout: 15_000 });
  } finally {
    await Promise.allSettled([firstContext.close(), secondContext.close()]);
  }
});

test('an untrusted sign-out purges the UID outbox and prior persistent Firestore cache @emulator', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('athar.trust-seeded') !== 'true') {
      localStorage.setItem('athar.trusted-device', 'true');
      sessionStorage.setItem('athar.trust-seeded', 'true');
    }
  });
  try {
    await signIn(page, 'terrain.31');
    await expect.poll(async () => page.evaluate(async () =>
      (await indexedDB.databases()).some((database) => database.name?.includes('firestore'))
    )).toBe(true);

    await page.evaluate(async () => {
      localStorage.setItem('athar.trusted-device', 'false');
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('athar-prototype-outbox', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('entries', 'readwrite');
        transaction.objectStore('entries').put({
          storageKey: 'member-1:visit-before-logout',
          commandId: 'visit-before-logout',
          authorId: 'member-1',
          doorId: 'pilot-door-002',
          statusId: 'retry',
          note: '',
          expectedRevision: 0,
          createdAt: '2026-08-03T10:00:00.000Z',
          state: 'pending'
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });

    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Se deconnecter' }).click()
    ]);
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('athar-prototype-outbox', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const entries = await new Promise<unknown[]>((resolve, reject) => {
        const transaction = database.transaction('entries', 'readonly');
        const request = transaction.objectStore('entries').index('authorId').getAll('member-1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      const firestoreCacheExists = (await indexedDB.databases()).some((candidate) => candidate.name?.includes('firestore'));
      return { entries: entries.length, firestoreCacheExists };
    })).toEqual({ entries: 0, firestoreCacheExists: false });
  } finally {
    await context.close();
  }
});

test('the desktop dashboard is reserved to admins and reads a selected zone from Firestore @emulator', async ({ browser }) => {
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  try {
    await signIn(member, 'terrain.31');
    await member.goto('/admin');
    await expect(member.getByRole('heading', { name: 'Acces reserve' })).toBeVisible();
  } finally {
    await memberContext.close();
  }

  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const admin = await adminContext.newPage();
  try {
    await signIn(admin, 'pilot.admin');
    await admin.goto('/admin');
    await expect(admin.getByRole('heading', { name: 'Couverture terrain' })).toBeVisible();
    await expect(admin.getByLabel('Zone suivie')).toHaveValue('carmes');
    await expect(admin.getByTestId('zone-door-count')).toHaveText('1');
    await expect(admin.getByTestId('zone-building-count')).toHaveText('1');
    await admin.getByLabel('Filtre par statut').selectOption('unvisited');
    await expect(admin.getByTestId('zone-status-count')).toHaveText('1');
    await expect(admin.getByText('1 rue du Pilote, Toulouse')).toBeVisible();

    await admin.getByLabel('Zone suivie').selectOption('saint-cyprien');
    await expect(admin.getByRole('alert')).toContainText('Projection de compteurs invalide');
    await expect(admin.getByTestId('zone-door-count')).toHaveText('-');
    await expect(admin.getByTestId('zone-building-count')).toHaveText('0');

    await admin.getByLabel('Zone suivie').selectOption('pagination');
    await expect(admin.getByTestId('zone-building-count')).toHaveText('50');
    await expect(admin.getByText('50 affiches / 51 lus')).toBeVisible();
    await admin.getByRole('button', { name: 'Suivants' }).click();
    await expect(admin.getByTestId('zone-building-count')).toHaveText('1');
    await expect(admin.getByText('1 affiches / 1 lus')).toBeVisible();
  } finally {
    await adminContext.close();
  }
});
