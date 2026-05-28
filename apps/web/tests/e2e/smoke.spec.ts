import { expect, test } from '@playwright/test';

test('home page renders phase-0 smoke shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CIPP-GoogleExtension' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit' })).toBeVisible();
});
