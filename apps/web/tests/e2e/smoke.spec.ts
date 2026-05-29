import { expect, test } from '@playwright/test';

test('home page renders the scaffolded shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'CIPP-GoogleExtension' })).toBeVisible();
  await expect(page.getByText('Hello from the Phase 0 scaffolding')).toBeVisible();
});

test('customer list links into merged user detail flow', async ({ page }) => {
  await page.goto('/customers');

  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await page.getByRole('link', { name: 'Open users' }).first().click();
  await expect(page.getByRole('heading', { name: 'Customer users' })).toBeVisible();

  await page.getByRole('link', { name: 'Open' }).first().click();
  await expect(page.getByRole('heading', { name: 'User Detail' })).toBeVisible();
  await expect(page.getByText(/M365:/)).toBeVisible();
  await expect(page.getByText(/Google:/)).toBeVisible();
});
