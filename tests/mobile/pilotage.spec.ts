import { expect, test } from '@playwright/test';

test('pilotage and access confirmation remain usable with enlarged mobile text @emulator', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail ou identifiant').fill('pilot.admin');
  await page.getByLabel('Mot de passe').fill('Temporary-password-123');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Zones de Toulouse|Choisis la zone/ })).toBeVisible({ timeout: 30_000 });
  await page.goto('/admin/members');
  await expect(page.getByRole('heading', { name: 'Gérer les membres' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const firstAction = page.getByRole('button', { name: 'Suspendre l’accès' }).first();
  await expect(firstAction).toBeVisible({ timeout: 30_000 });
  await firstAction.click();
  const dialog = page.getByRole('dialog', { name: 'Suspendre l’accès' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Confirmer la modification' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(firstAction).toBeFocused();
  await page.goto('/outings');
  await expect(page.getByRole('heading', { name: 'Sorties terrain' })).toBeVisible();
  await expect(page.getByText('Les files des autres appareils ne sont pas visibles ici.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Démarrer la sortie', exact: true })).toBeVisible();
});
