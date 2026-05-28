import { expect, test } from '@playwright/test';

test('GST-12 smoke: stubbed merged user flow and inconsistent retry', async ({ page }) => {
  await page.goto('/customers');
  await page.getByRole('heading', { name: 'Customers' }).scrollIntoViewIfNeeded();
  await page.locator('a[href="/customers/acme/users"]').click();

  await expect(page.getByRole('heading', { name: 'Customer users' })).toBeVisible();
  await expect(page.getByText('Ari Miller')).toBeVisible();

  await page.locator('a[href="/customers/acme/users/user-001"]').click();

  const suspend = page.getByRole('button', { name: 'Suspend in both systems' });
  await expect(suspend).toBeVisible();
  await suspend.click();
  await expect(page.getByText('Overall status').locator('..').getByText('Suspended')).toBeVisible();

  const resume = page.getByRole('button', { name: 'Resume in both systems' });
  await resume.click();
  await expect(page.getByText('Overall status').locator('..').getByText('Active')).toBeVisible();

  await page.goto('/customers/acme/users');
  await page.locator('a[href="/customers/acme/users/user-003-partial"]').click();
  await expect(page.getByText('Inconsistent')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Google' })).toBeVisible();

  await page.getByRole('button', { name: 'Retry Google' }).click();
  await expect(page.getByText('Overall status').locator('..').getByText('Suspended')).toBeVisible();
});

test('GST-12 a11y: keyboard navigation through action controls and audit table', async ({ page }) => {
  await page.goto('/audit');

  const customerFilter = page.getByLabel('Customer');
  await customerFilter.focus();
  await expect(customerFilter).toBeFocused();

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');

  const firstAuditRow = page.locator('table[aria-label="Audit log"] tbody tr').first();
  await expect(firstAuditRow).toBeVisible();
  await expect(firstAuditRow).toBeFocused();

  await page.goto('/customers/acme/users/user-001');
  const actionButton = page.getByRole('button', { name: /Suspend in both systems|Resume in both systems/ });
  await actionButton.focus();
  await expect(actionButton).toBeFocused();

  await page.goto('/audit');
  await expect(page.getByRole('button', { name: 'Previous audit page' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next audit page' })).toBeVisible();
});
