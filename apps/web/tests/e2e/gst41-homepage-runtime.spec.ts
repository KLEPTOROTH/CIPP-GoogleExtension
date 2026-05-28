import { expect, test } from '@playwright/test';

test('GST-41 guard: homepage responds 200 in dev runtime and renders core markers', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain('CIPP-GoogleExtension');
  expect(body).toContain('Customers');
  expect(body).toContain('Audit');
});
