import { expect, test } from '@playwright/test';

async function expectAccessShell(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Configuration requise' })
      .or(page.getByRole('heading', { name: 'Connexion' }))
      .or(page.getByRole('heading', { name: 'Verification en cours' }))
  ).toBeVisible();
}

test('renders the guarded access shell without a blank screen', async ({ page }) => {
  await page.goto('/');
  await expectAccessShell(page);

  await page.goto('/admin/members');
  await expectAccessShell(page);

  await page.goto('/login');
  await expectAccessShell(page);
});
