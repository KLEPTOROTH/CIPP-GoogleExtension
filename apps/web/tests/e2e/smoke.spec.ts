import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/test/reset-gst12-fixtures');
});

test('home page links to phase-1 routes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CIPP-GoogleExtension' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CIPP integration' })).toBeVisible();
  const sourceLink = page.getByRole('link', { name: 'Source code' });
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveAttribute('href', '/source');

  const licenseLink = page.getByRole('link', { name: 'License' });
  await expect(licenseLink).toBeVisible();
  await expect(licenseLink).toHaveAttribute('href', '/license');
});

test('source and license pages are directly reachable', async ({ page }) => {
  await page.route('**/api/source', async (route) => {
    await route.fulfill({
      json: {
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        tag: 'v0.1.0',
        repoUrl: 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension',
        license: 'AGPL-3.0',
      },
    });
  });

  await page.goto('/source');
  await expect(page.getByRole('heading', { name: 'Source code' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open repository' })).toHaveAttribute(
    'href',
    'https://github.com/KLEPTOROTH/CIPP-GoogleExtension/tree/v0.1.0',
  );
  await expect(page.getByText('Source: GitHub @ v0.1.0 (commit 01234567)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View license' })).toHaveAttribute(
    'href',
    '/license',
  );

  await page.goto('/license');
  await expect(page.getByRole('heading', { name: 'License' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read AGPL-3.0' })).toHaveAttribute(
    'href',
    'https://github.com/KLEPTOROTH/CIPP-GoogleExtension/blob/main/LICENSE',
  );
});

test('source page falls back to commit URL for untagged builds', async ({ page }) => {
  await page.route('**/api/source', async (route) => {
    await route.fulfill({
      json: {
        commitSha: 'abcdef0123456789abcdef0123456789abcdef01',
        tag: 'untagged',
        repoUrl: 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension',
        license: 'AGPL-3.0',
      },
    });
  });

  await page.goto('/source');
  await expect(page.getByRole('link', { name: 'Open repository' })).toHaveAttribute(
    'href',
    'https://github.com/KLEPTOROTH/CIPP-GoogleExtension/commit/abcdef0123456789abcdef0123456789abcdef01',
  );
});

test('golden path: suspend then resume from user detail', async ({ page }) => {
  await page.goto('/customers/acme/users/user-001');

  await expect(page.getByText('M365: Active')).toBeVisible();
  await expect(page.getByText('Google: Active')).toBeVisible();

  await page.getByRole('button', { name: 'Suspend in both systems' }).click();
  await expect(page.getByText('M365: Suspended')).toBeVisible();
  await expect(page.getByText('Google: Suspended')).toBeVisible();

  await page.getByRole('button', { name: 'Resume in both systems' }).click();
  await expect(page.getByText('M365: Active')).toBeVisible();
  await expect(page.getByText('Google: Active')).toBeVisible();
});

test('partial path: inconsistent user supports retry affordance and resolves', async ({ page }) => {
  await page.goto('/customers/acme/users/user-003-partial');

  await expect(page.getByText('Inconsistent')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry M365' })).toBeVisible();

  await page.getByRole('button', { name: 'Retry Google' }).click();

  await expect(page.getByText('M365: Suspended')).toBeVisible();
  await expect(page.getByText('Google: Suspended')).toBeVisible();
  await expect(page.getByText('Suspended', { exact: true })).toBeVisible();
});

test('typed machine-parseable error is rendered in UI on retry failure', async ({ page }) => {
  await page.goto('/customers/globex/users/user-g1');

  await page.getByRole('button', { name: 'Retry Google' }).click();

  await expect(page.getByText(/API Error\s+INCONSISTENT_RETRY_REQUIRED/)).toBeVisible();
  await expect(page.getByText(/requestId:/)).toBeVisible();
});

test('keyboard navigation: suspend action + audit table row focus', async ({ page }) => {
  await page.goto('/customers/acme/users/user-001');

  let focusedSuspend = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press('Tab');
    const activeText = await page.evaluate(() => document.activeElement?.textContent ?? '');
    if (activeText.includes('Suspend in both systems')) {
      focusedSuspend = true;
      break;
    }
  }

  expect(focusedSuspend).toBe(true);
  await page.keyboard.press('Enter');

  await expect(page.getByText('M365: Suspended')).toBeVisible();

  await page.goto('/audit');
  const firstRow = page.locator('tr[aria-label="audit row 1"]');
  let focusedFirstRow = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await firstRow.evaluate((node) => node === document.activeElement)) {
      focusedFirstRow = true;
      break;
    }
  }

  expect(focusedFirstRow).toBe(true);
  await expect(firstRow).toBeFocused();
});
