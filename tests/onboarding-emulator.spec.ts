import { expect, test } from '@playwright/test';

test('the invitation-only entry has no public registration and an invited member reaches the workspace @emulator', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Créer un compte/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Je n’ai pas encore d’accès' }).click();
  await expect(page.getByRole('heading', { name: 'C’est ton coordinateur qui t’ouvre l’accès.' })).toBeVisible();
  await page.getByRole('button', { name: 'Revenir à la connexion' }).click();

  await page.getByLabel('Adresse e-mail ou identifiant').fill('pilot.admin');
  await page.getByLabel('Mot de passe').fill('Temporary-password-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Zones de Toulouse' })).toBeVisible({ timeout: 20_000 });
});
