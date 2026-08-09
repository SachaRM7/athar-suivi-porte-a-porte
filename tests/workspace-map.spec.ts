import { expect, test, type Page } from '@playwright/test';

/**
 * Emprises de l'échantillon `public/fixtures/batiments-carmes.pmtiles`, servi par la route
 * de régression. Le tuileset départemental de WP6 vit hors de Git.
 */
const FOOTPRINTS = {
  suivi: { longitude: 1.4454, latitude: 43.6058 },        // building-dalbad, document Firestore
  todo: { longitude: 1.447, latitude: 43.6065 },          // PG31CARMES002, aucun document
  vide: { longitude: 1.4448, latitude: 43.607 }           // aucune emprise
};

function mercator(latitude: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
}

/** Projette une position sur le canevas MapLibre, qui est à plat et sans rotation. */
async function clickOnMap(page: Page, target: { longitude: number; latitude: number }): Promise<void> {
  const surface = page.getByLabel('Carte MapLibre des zones');
  const viewport = JSON.parse((await surface.getAttribute('data-viewport')) ?? '{}') as { north: number; south: number; east: number; west: number };
  const canvas = await page.locator('.maplibregl-canvas').boundingBox();
  if (!canvas) throw new Error('Le canevas MapLibre est absent.');
  const x = canvas.x + ((target.longitude - viewport.west) / (viewport.east - viewport.west)) * canvas.width;
  const y = canvas.y + ((mercator(viewport.north) - mercator(target.latitude)) / (mercator(viewport.north) - mercator(viewport.south))) * canvas.height;
  expect(x, 'la cible doit être dans le cadre').toBeGreaterThan(canvas.x);
  expect(x).toBeLessThan(canvas.x + canvas.width);
  expect(y).toBeGreaterThan(canvas.y);
  expect(y).toBeLessThan(canvas.y + canvas.height);
  // Le panneau desktop flotte au-dessus du bord gauche de la carte. Déclencher l'appui sur
  // le canvas évite que ce chrome intercepte les coordonnées d'une emprise située dessous.
  await page.locator('.maplibregl-canvas').click({
    force: true,
    position: { x: x - canvas.x, y: y - canvas.y }
  });
}

async function openFieldMap(page: Page): Promise<void> {
  await page.goto('/technical-map');
  await expect(page.getByText('2 batiment(s) visibles')).toBeVisible({ timeout: 15_000 });
  // Les sept emprises de l'échantillon doivent être tuilées avant tout appui sur la carte.
  await expect.poll(
    async () => Number((await page.getByLabel('Carte MapLibre des zones').getAttribute('data-footprints')) ?? '0'),
    { timeout: 20_000 }
  ).toBe(7);
}

async function enterEdition(page: Page): Promise<void> {
  const desktopSwitch = page.getByRole('button', { name: 'Édition' });
  if (await desktopSwitch.isVisible()) await desktopSwitch.click();
  else await page.getByRole('button', { name: 'Passer en mode Édition' }).click();
}

test('draws and saves an editable local zone over the prepared MapLibre package', async ({ page }) => {
  await page.goto('/technical-map');
  await expect(page.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible();
  await expect(page.getByLabel('Carte MapLibre des zones')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.building-row')).toHaveCount(2, { timeout: 15_000 });

  await expect(page.getByLabel('Outils de zone')).toBeHidden();
  await enterEdition(page);
  await page.getByRole('button', { name: 'Redessiner' }).click();
  await expect(page.getByText('Edition de Carmes. Ajustez le contour, le nom ou la couleur.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Nom de la zone' }).fill('Carmes centre');
  await page.getByLabel('Couleur de la zone').fill('#D8A200');
  await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
  await expect(page.getByText(/Zone enregistree\. 2 batiment\(s\) rattache\(s\) par point-dans-polygone\./)).toBeVisible();
  await expect(page.getByText('2 rattache(s)')).toBeVisible();

  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  await expect(page.getByRole('dialog', { name: 'Detail du batiment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '18 rue du Languedoc, Toulouse' })).toBeVisible();
  await expect(page.locator('.building-floor-label')).toHaveText(['1er', 'RDC']);
  await page.getByRole('button', { name: 'Porte 11, Contact établi' }).click();
  await expect(page.getByRole('dialog', { name: 'Fiche de la porte 11' })).toBeVisible();
  await page.getByRole('button', { name: 'Absent', exact: true }).click();
  await expect(page.getByText(/Porte 11: passage .* cree, revision 2\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Porte 11, Absent' })).toBeVisible();

  await page.getByRole('button', { name: 'tout marquer absent' }).first().click();
  await expect(page.getByText('1 passage(s) « Absent » enregistres pour cet etage.')).toBeVisible();
  await expect(page.locator('.building-floor').first().getByText('terminé', { exact: true })).toBeVisible();
  await expect(page.getByText('2 attente(s)')).toBeVisible();

  await page.getByRole('button', { name: 'Configurer le batiment' }).click();
  await page.getByRole('button', { name: 'Ajustement manuel' }).click();
  const plan = page.getByRole('textbox', { name: 'Plan manuel de portes' });
  const originalPlan = await plan.inputValue();
  await plan.fill(originalPlan.replace('1 | 12 | door-dalbad-12', '1 | 12A | door-dalbad-12'));
  await page.getByRole('button', { name: 'Appliquer le plan manuel' }).click();
  await expect(page.getByText('Structure bloquee: synchronisez ou resolvez les passages locaux des portes concernees.')).toBeVisible();

  await plan.fill(`${originalPlan}\n2 | 21`);
  await page.getByRole('button', { name: 'Appliquer le plan manuel' }).click();
  await expect(page.getByText('Structure enregistree: 1 ajoutee(s), 0 ajustee(s), 0 archivee(s).')).toBeVisible();
  await expect(page.getByText('5 portes')).toBeVisible();
});

test('opens the building cut in the desktop floating panel', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('/technical-map');
  await expect(page.locator('.building-row')).toHaveCount(2, { timeout: 15_000 });
  const mapBounds = await page.getByLabel('Carte MapLibre des zones').boundingBox();
  expect(mapBounds?.y).toBeLessThan(400);
  expect(mapBounds?.height).toBeGreaterThan(400);
  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  const dialog = page.getByRole('dialog', { name: 'Detail du batiment' });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds?.x).toBeCloseTo(16, 0);
  expect(bounds?.y).toBeCloseTo(74, 0);
  expect(bounds?.width).toBeCloseTo(352, 0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeCloseTo(784, 0);
  await page.close();
});

test('opens a detected building that has no Firestore document on its empty state', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  await clickOnMap(page, FOOTPRINTS.todo);
  const dialog = page.getByRole('dialog', { name: 'Detail du batiment' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bâtiment PG31CARMES002' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bâtiment non décrit' })).toBeVisible();
  await expect(page.locator('.building-row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Retour à la zone' }).click();
  await expect(dialog).toBeHidden();
  await page.close();
});

test('opens the tracked footprint on its recorded doors', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  await clickOnMap(page, FOOTPRINTS.suivi);
  await expect(page.getByRole('heading', { name: '18 rue du Languedoc, Toulouse' })).toBeVisible();
  await page.close();
});

test('creates nothing on an empty press', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);
  const dialog = page.getByRole('dialog', { name: 'Detail du batiment' });

  await clickOnMap(page, FOOTPRINTS.vide);
  await expect(dialog).toBeHidden();

  await expect(page.locator('.building-row')).toHaveCount(2);
  await page.close();
});

test('hides individual footprints below zoom 16', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  await page.locator('.maplibregl-ctrl-zoom-out').click();
  await expect.poll(async () => {
    const viewport = JSON.parse((await page.getByLabel('Carte MapLibre des zones').getAttribute('data-viewport')) ?? '{}') as { east: number; west: number };
    return viewport.east - viewport.west;
  }, { timeout: 10_000 }).toBeGreaterThan(0.011);

  await clickOnMap(page, FOOTPRINTS.todo);
  await expect(page.getByRole('dialog', { name: 'Detail du batiment' })).toBeHidden();
  await page.close();
});

test('announces manual placement and opens a local building without persisting it', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  await enterEdition(page);
  await page.getByRole('button', { name: 'Ajouter un bâtiment' }).click();
  const hint = page.getByText('Touche la carte à l’emplacement exact du bâtiment');
  await expect(hint).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(hint).toBeHidden();
  await expect(page.getByText('Pose annulee. Rien n a ete cree.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Nouveau batiment' })).toBeHidden();

  await page.getByRole('button', { name: 'Ajouter un bâtiment' }).click();
  await clickOnMap(page, FOOTPRINTS.vide);
  await expect(page.getByRole('dialog', { name: 'Detail du batiment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bâtiment posé manuellement' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bâtiment non décrit' })).toBeVisible();
  await expect(page.locator('.building-row')).toHaveCount(2);
  await page.close();
});

test('keeps the map full-frame and moves the mobile controls with the bottom sheet', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('/technical-map');
  await expect(page.locator('.building-row')).toHaveCount(2, { timeout: 15_000 });
  await expect.poll(
    async () => Number((await page.getByLabel('Carte MapLibre des zones').getAttribute('data-footprints')) ?? '0'),
    { timeout: 20_000 }
  ).toBeGreaterThan(0);

  const map = await page.getByLabel('Carte MapLibre des zones').boundingBox();
  const panelBefore = await page.getByLabel('Batiments visibles').boundingBox();
  const fabBefore = await page.getByRole('button', { name: 'Cadrer sur les emprises' }).boundingBox();
  expect(map).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  expect(panelBefore?.height).toBeCloseTo(306, 0);

  await page.getByRole('button', { name: 'Agrandir le panneau' }).click();
  const panelAfter = await page.getByLabel('Batiments visibles').boundingBox();
  const fabAfter = await page.getByRole('button', { name: 'Cadrer sur les emprises' }).boundingBox();
  expect(panelAfter?.height).toBeCloseTo(620, 0);
  expect(fabAfter?.y ?? 0).toBeLessThan(fabBefore?.y ?? 0);

  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  const buildingSheet = await page.getByRole('dialog', { name: 'Detail du batiment' }).boundingBox();
  expect(buildingSheet).toMatchObject({ x: 0, y: 224, width: 390, height: 620 });
  expect(await page.getByLabel('Carte MapLibre des zones').boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.locator('.building-floor-label')).toHaveText(['1er', 'RDC']);
  await page.getByRole('button', { name: 'Porte 11, Contact établi' }).click();
  expect(await page.getByRole('dialog', { name: 'Detail du batiment' }).boundingBox()).toMatchObject({ x: 0, y: 452, width: 390, height: 392 });
  await page.close();
});

test('keeps the sisters marker on the door across reopenings, without touching its status', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // Ce parcours passe par la fiche, pas par la carte : inutile d'attendre les emprises.
  await page.goto('/technical-map');
  await expect(page.locator('.building-row')).toHaveCount(2, { timeout: 45_000 });

  await page.getByRole('button', { name: '7 rue des Filatiers, Toulouse' }).click();
  const sistersDoor = page.getByRole('button', { name: 'Porte 12, Pas encore fait' });
  await expect(sistersDoor).toHaveClass(/door-row--sisters/);
  await sistersDoor.click();
  const toggle = page.getByRole('button', { name: 'À confier aux sœurs' });
  // La donnée de démonstration porte déjà le marqueur : il doit revenir armé.
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  // Le marqueur ne crée aucun passage : le statut de la porte ne bouge pas.
  await expect(page.getByRole('heading', { name: 'Porte 12 · 1er' })).toBeVisible();
  await expect(page.getByText('Aucun passage enregistré.')).toBeVisible();

  await page.locator('.door-detail-back').click();
  await page.getByRole('button', { name: 'Porte 12, Pas encore fait' }).click();
  await expect(page.getByRole('button', { name: 'À confier aux sœurs' })).toHaveAttribute('aria-pressed', 'false');
  await page.close();
});

test('records the five real passage results and keeps the previous history immutable', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('/technical-map');
  await expect(page.locator('.building-row')).toHaveCount(2, { timeout: 45_000 });

  // Aucune composition sensible ne fuit dans la liste des bâtiments.
  await expect(page.getByText('Femme seule')).toHaveCount(0);
  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  await page.getByRole('button', { name: 'Porte 11, Contact établi' }).click();
  const detail = page.getByRole('dialog', { name: 'Fiche de la porte 11' });
  await expect(detail.getByRole('button', { name: 'Contact établi' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Absent', exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: "Attaché à l'effort — plus à revisiter" })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Ne pas déranger' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Accès bloqué (interphone / code)' })).toBeVisible();
  await expect(detail.locator('.door-history li')).toHaveCount(1);
  await expect(detail.locator('.door-history')).toContainText('Terrain 31');

  await detail.getByRole('button', { name: "Attaché à l'effort — plus à revisiter" }).click();
  await expect(page.getByRole('button', { name: "Porte 11, Attaché à l'effort" })).toBeVisible();
  await page.getByRole('button', { name: "Porte 11, Attaché à l'effort" }).click();
  await expect(page.getByRole('dialog', { name: 'Fiche de la porte 11' }).locator('.door-history li')).toHaveCount(2);
  await page.close();
});

test('persists the household composition and automatically arms the sisters marker', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('/technical-map');
  await expect(page.locator('.building-row')).toHaveCount(2, { timeout: 45_000 });
  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();
  await page.getByRole('button', { name: 'Porte 12, Pas encore fait' }).click();

  await page.getByRole('button', { name: 'Femme seule' }).click();
  await expect(page.getByRole('button', { name: 'Femme seule' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'À confier aux sœurs' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Activé automatiquement — tu peux le désactiver.')).toBeVisible();

  await page.locator('.door-detail-back').click();
  await expect(page.getByRole('button', { name: 'Porte 12, Pas encore fait' })).toHaveClass(/door-row--sisters/);
  await page.getByRole('button', { name: 'Porte 12, Pas encore fait' }).click();
  await expect(page.getByRole('button', { name: 'Femme seule' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'À confier aux sœurs' })).toHaveAttribute('aria-pressed', 'true');
  await page.close();
});

test('reads the ancienneté column, its ninety-day alert and its two filters', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('/technical-map');
  await expect(page.locator('.building-row')).toHaveCount(2, { timeout: 45_000 });
  const rows = page.locator('.building-row');

  // Le jeu de démonstration oppose un passage récent à un passage de plus de trois mois.
  const stale = rows.filter({ hasText: '7 rue des Filatiers' });
  const fresh = rows.filter({ hasText: '18 rue du Languedoc' });
  await expect(stale.locator('.building-row-age')).toHaveText(/il y a \d+ mois/);
  await expect(stale.locator('.building-row-age')).toHaveClass(/alert/);
  await expect(fresh.locator('.building-row-age')).not.toHaveClass(/alert/);

  // Tri par ancienneté : le plus ancien vient en premier.
  await expect(rows.first()).toContainText('7 rue des Filatiers');
  await page.getByLabel('Trier les bâtiments').selectOption('address');
  await expect(rows.first()).toContainText('18 rue du Languedoc');

  await page.getByRole('button', { name: 'Pas vu > 3 mois' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('7 rue des Filatiers');

  // « Pas encore fait » est une autre pile : ici, aucun bâtiment décrit sans passage.
  await page.getByRole('button', { name: 'Pas encore fait' }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole('button', { name: 'Tous' }).click();
  await expect(rows).toHaveCount(2);
  await page.close();
});

test('suggests the cadastral structure without ever creating a door on its own', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);

  // PG31CARMES003 porte 1 niveau et 1 logement : le cadastre décrit un pavillon.
  await clickOnMap(page, { longitude: 1.45, latitude: 43.608 });
  await expect(page.getByRole('heading', { name: 'Bâtiment PG31CARMES003' })).toBeVisible();
  await page.getByRole('button', { name: 'Décrire le bâtiment' }).click();
  const notice = page.getByText('suggestion d’après le cadastre — à confirmer');
  await expect(notice).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer 1 portes' })).toBeVisible();

  // La mention s'efface dès qu'un frère ajuste un réglage : ce n'est plus le cadastre.
  await page.getByRole('button', { name: 'Augmenter — Étages au-dessus du rez-de-chaussée' }).click();
  await page.getByRole('button', { name: 'Augmenter — Étages au-dessus du rez-de-chaussée' }).click();
  await expect(notice).toBeHidden();
  await expect(page.getByRole('button', { name: 'Créer 3 portes' })).toBeVisible();

  // La suggestion n'écrit rien : tant que personne ne valide, aucune porte n'existe.
  await page.getByRole('dialog', { name: 'Configurer le batiment' }).getByRole('button', { name: 'Fermer la configuration' }).click();
  await expect(page.getByRole('heading', { name: 'Bâtiment non décrit' })).toBeVisible();
  await page.close();
});

test('updates the structure preview live and protects a visited door from one-click deletion', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFieldMap(page);
  await page.getByRole('button', { name: '18 rue du Languedoc, Toulouse' }).click();

  await page.getByRole('button', { name: 'Configurer le batiment' }).click();
  await expect(page.getByRole('heading', { name: 'Structure du bâtiment' })).toBeVisible();
  await expect(page.getByText('suggestion d’après le cadastre — à confirmer')).toBeHidden();
  await page.getByRole('button', { name: 'Augmenter — Étages au-dessus du rez-de-chaussée' }).click();
  await expect(page.getByRole('region', { name: 'Aperçu vivant' }).getByText('2ème')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer 6 portes' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Configurer le batiment' }).getByRole('button', { name: 'Fermer la configuration' }).click();

  await page.getByRole('button', { name: 'Modifier' }).click();
  await expect(page.getByRole('button', { name: '+ Ajouter un étage au-dessus' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ porte' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Supprimer la porte 11' }).click();
  await expect(page.getByText('Supprimer l’historique ?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Porte 11, Contact établi' })).toBeHidden();
  await page.getByRole('button', { name: 'Annuler la suppression de la porte 11' }).click();
  await expect(page.getByRole('button', { name: 'Porte 11, Contact établi' })).toBeVisible();
  await page.close();
});
