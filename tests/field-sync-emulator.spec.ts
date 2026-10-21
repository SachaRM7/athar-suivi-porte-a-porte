import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail ou identifiant').fill(username);
  await page.getByLabel('Mot de passe').fill('Temporary-password-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  // Selon le nombre de zones, la connexion ouvre la carte ou le choix de la zone de sortie.
  await expect(page.getByRole('heading', { name: /Zones de Toulouse|Choisis la zone de la sortie/ })).toBeVisible({ timeout: 20_000 });
  // La carte terrain n'ouvre la liste d'une zone qu'une fois celle-ci choisie.
  await page.goto('/?zone=carmes');
  await expect(page.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible({ timeout: 20_000 });
}

async function openDoor(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByRole('button', { name: '1 rue du Pilote, Toulouse' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: '1 rue du Pilote, Toulouse' }).click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Porte 02, Pas encore fait' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Porte 02, Pas encore fait' }).click();
  await page.getByRole('button', { name: 'Absent', exact: true }).click();
}

async function prepareBuildingCache(page: import('@playwright/test').Page): Promise<void> {
  // Rendu MapLibre logiciel en CI : la liste de zone peut mettre plus de 15 s à arriver.
  await expect(page.getByRole('button', { name: '1 rue du Pilote, Toulouse' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: '1 rue du Pilote, Toulouse' }).click();
  await expect(page.getByRole('button', { name: 'Porte 02, Pas encore fait' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Retour à la zone' }).click();
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
      const request = indexedDB.open('athar-prototype-outbox');
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
  test.setTimeout(240_000);
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
    await expect(first.getByRole('button', { name: '1 rue du Pilote, Toulouse' })).toBeVisible({ timeout: 45_000 });
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

    await expect(first.getByText('Hors ligne', { exact: true })).toBeVisible();
    await expect(second.getByText('Hors ligne', { exact: true })).toBeVisible();
    // Le bandeau réseau précède l'écriture asynchrone du passage : attendre la
    // sauvegarde durable sur les deux appareils avant de recharger ou reconnecter.
    await Promise.all([
      expect.poll(() => outboxEntries(first, 'member-1')).toHaveLength(1),
      expect.poll(() => outboxEntries(second, 'member-b')).toHaveLength(1)
    ]);
    const pendingBeforeReload = await outboxEntries(second, 'member-b');
    expect(pendingBeforeReload).toHaveLength(1);

    await second.reload();
    await expect(second.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => outboxEntries(second, 'member-b')).toEqual(pendingBeforeReload);
    await second.getByRole('button', { name: '1 rue du Pilote, Toulouse' }).click();
    await expect(second.getByRole('button', { name: 'Porte 02, Absent' })).toBeVisible({ timeout: 15_000 });

    await firstContext.setOffline(false);
    await first.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(first.getByText('À jour', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(serverDoorRevision).toBe(1);
    await expect.poll(async () => outboxEntries(second, 'member-b')).toEqual(pendingBeforeReload);

    await secondContext.unroute(/127\.0\.0\.1:(8180|9199|5101)/);
    await second.evaluate(() => {
      localStorage.setItem('athar.test-firebase-offline', 'false');
      window.dispatchEvent(new Event('online'));
    });
    const resolution = second.getByLabel('Resolution du conflit');
    await expect(resolution).toBeVisible({ timeout: 15_000 });
    await expect(resolution.getByText(/elle est maintenant « Absent » sur le serveur/)).toBeVisible();

    await second.getByRole('button', { name: 'Réappliquer mon passage' }).click();
    await expect(second.getByText('À jour', { exact: true })).toBeVisible({ timeout: 15_000 });
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
        const request = indexedDB.open('athar-prototype-outbox');
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
          // Révision périmée : si une synchronisation passe, l'entrée devient un conflit et
          // reste sur l'appareil. Elle compte donc toujours comme non envoyée.
          expectedRevision: 99,
          createdAt: '2026-08-03T10:00:00.000Z',
          state: 'pending'
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    });

    // Une saisie non synchronisée n'est jamais effacée en silence : la déconnexion s'arrête
    // et prévient. « Rester connecté » garde la saisie intacte.
    await page.getByRole('button', { name: /^Compte de / }).click();
    await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
    const warning = page.getByRole('dialog', { name: 'Des saisies ne sont pas encore envoyées' });
    await expect(warning).toBeVisible();
    await expect(warning.getByText('1 passage n’est pas encore envoyé au serveur.')).toBeVisible();
    await warning.getByRole('button', { name: 'Rester connecté' }).click();
    await expect(warning).toBeHidden();
    await expect.poll(async () => page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('athar-prototype-outbox');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const count = await new Promise<number>((resolve, reject) => {
        const request = database.transaction('entries', 'readonly').objectStore('entries').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return count;
    })).toBe(1);

    // Confirmation explicite : la purge efface alors la partition de l'UID et le cache.
    await page.getByRole('button', { name: /^Compte de / }).click();
    await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('dialog', { name: 'Des saisies ne sont pas encore envoyées' }).getByRole('button', { name: 'Effacer et me déconnecter' }).click()
    ]);
    await expect(page.getByRole('heading', { name: 'Reprendre là où la zone s’est arrêtée.' })).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('athar-prototype-outbox');
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
    await expect(member.getByRole('heading', { name: 'Accès réservé' })).toBeVisible();
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
    await admin.getByLabel('Compteur par statut').selectOption('unvisited');
    await expect(admin.getByTestId('zone-status-count')).toHaveText('1');
    await expect(admin.getByText('1 rue du Pilote, Toulouse')).toBeVisible();

    await admin.getByLabel('Zone suivie').selectOption('saint-cyprien');
    await expect(admin.getByRole('alert')).toContainText('Projection de compteurs invalide');
    await expect(admin.getByTestId('zone-recorded-progress')).toHaveText('—');
    await expect(admin.getByText('Statistiques indisponibles', { exact: true })).toBeVisible();
    await expect(admin.getByTestId('zone-door-count')).toHaveText('-');
    await expect(admin.getByTestId('zone-building-count')).toHaveText('1');

    await admin.getByLabel('Zone suivie').selectOption('pagination');
    await expect(admin.getByTestId('zone-recorded-progress')).toHaveText('—');
    await expect(admin.getByText('Aucune porte décrite dans ce relevé')).toBeVisible();
    await expect(admin.getByTestId('zone-building-count')).toHaveText('50');
    await expect(admin.getByText('50 affiches / 51 lus')).toBeVisible();
    await admin.getByRole('button', { name: 'Suivants' }).click();
    await expect(admin.getByTestId('zone-building-count')).toHaveText('1');
    await expect(admin.getByText('1 affiches / 1 lus')).toBeVisible();
  } finally {
    await adminContext.close();
  }
});

test('the desktop dashboard, map and zone choice share a dated projection and distinguish missing data @emulator', async ({ page }) => {
  test.setTimeout(120_000);
  // Relevé historique volontairement différent de l'état courant des portes de la fixture.
  // Les trois écrans doivent afficher ce même relevé daté, sans prétendre être à jour.
  const statsUrl = 'http://127.0.0.1:8180/v1/projects/athar-local/databases/(default)/documents/workspaces/main/zoneStats/carmes';
  const response = await fetch(statsUrl, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      doorCount: { integerValue: '6' },
      countsByStatus: { mapValue: { fields: { unvisited: { integerValue: '3' }, contacted: { integerValue: '2' }, retry: { integerValue: '1' } } } },
      updatedAt: { timestampValue: '2026-08-03T08:00:00Z' }
    } })
  });
  expect(response.ok).toBe(true);
  await signIn(page, 'pilot.admin');
  await expect(page.getByTestId('zone-recorded-progress')).toHaveText('50%');
  await expect(page.locator('.terrain-zonechip')).toHaveAttribute('title', /^Relevé du /);
  await page.goto('/admin');
  await expect(page.getByTestId('zone-recorded-progress')).toHaveText('50%');
  await expect(page.getByText('3/6 portes visitées', { exact: true })).toBeVisible();
  await page.goto('/login');
  const carmes = page.getByRole('radio').filter({ hasText: 'Carmes' });
  await expect(carmes.locator('.auth-zone-ring')).toHaveText('50%');
  await expect(carmes).toContainText('Relevé du');

  const unvisitedUrl = 'http://127.0.0.1:8180/v1/projects/athar-local/databases/(default)/documents/workspaces/main/statuses/unvisited';
  expect((await fetch(unvisitedUrl, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })).ok).toBe(true);
  await page.goto('/admin');
  await expect(page.getByTestId('zone-recorded-progress')).toHaveText('50%');
  await expect(page.getByRole('status')).toContainText('La liste des statuts est incomplète');

  expect((await fetch(statsUrl, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })).ok).toBe(true);
  await page.goto('/login');
  await expect(carmes.locator('.auth-zone-ring')).toHaveText('—');
  await expect(carmes).toContainText('Statistiques indisponibles');
  await page.goto('/?zone=carmes');
  await expect(page.getByRole('button', { name: '1 rue du Pilote, Toulouse' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('zone-recorded-progress')).toHaveText('—');
  await page.goto('/admin');
  await expect(page.getByText('Statistiques indisponibles', { exact: true })).toBeVisible();
  await expect(page.getByTestId('zone-recorded-progress')).toHaveText('—');
});

test('canonical projections refresh the open map after a visit and an archive without reloading @emulator', async ({ page }) => {
  const { initializeApp, deleteApp } = await import('firebase-admin/app');
  const { getFirestore, GeoPoint, Timestamp } = await import('firebase-admin/firestore');
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
  const app = initializeApp({ projectId: 'athar-local' }, 'stats-browser');
  const db = getFirestore(app);
  const root = db.doc('workspaces/main');
  try {
    const sourceZone = (await root.collection('zones').doc('carmes').get()).data()!;
    const sourceDoor = (await root.collection('doors').doc('pilot-door-002').get()).data()!;
    const batch = db.batch();
    batch.set(root.collection('zones').doc('live-stats'), { ...sourceZone, name: 'Relevé en direct' });
    batch.set(root.collection('buildings').doc('live-building'), { addressLabel: 'Bâtiment de recette', location: new GeoPoint(43.606, 1.445), geohash: sourceDoor.geohash, zoneId: 'live-stats', createdBy: 'admin-1', structureRevision: 0 });
    batch.set(root.collection('doors').doc('live-door'), { ...sourceDoor, buildingId: 'live-building', zoneId: 'live-stats', revision: 0, lastVisitId: null, lastVisitAt: null, currentStatusId: 'unvisited', active: true });
    await batch.commit();
    await signIn(page, 'pilot.admin');
    await page.goto('/?zone=live-stats');
    await expect(page.getByTestId('zone-recorded-progress')).toHaveText('0%', { timeout: 20000 });
    const visitBatch = db.batch();
    const at = Timestamp.now();
    visitBatch.set(root.collection('visits').doc('live-visit'), { doorId: 'live-door', doorRevision: 1, statusId: 'retry', authorId: 'admin-1', occurredAt: at, syncedAt: at, note: '' });
    visitBatch.update(root.collection('doors').doc('live-door'), { revision: 1, lastVisitId: 'live-visit', lastVisitAt: at, currentStatusId: 'retry' });
    await visitBatch.commit();
    await expect(page.getByTestId('zone-recorded-progress')).toHaveText('100%', { timeout: 20000 });
    await root.collection('doors').doc('live-door').update({ active: false });
    await expect(page.getByTestId('zone-recorded-progress')).toHaveText('—', { timeout: 20000 });
    await expect(page.getByText('Relevé : Aucune porte décrite dans ce relevé', { exact: true })).toBeVisible();
  } finally {
    await deleteApp(app);
  }
});
