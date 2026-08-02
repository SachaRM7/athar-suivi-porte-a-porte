import { expect, test } from '@playwright/test';

test('guards application and admin routes when Firebase is not configured', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Configuration requise' })).toBeVisible();

  await page.goto('/admin/members');
  await expect(page.getByRole('heading', { name: 'Configuration requise' })).toBeVisible();

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Configuration requise' })).toBeVisible();
});
