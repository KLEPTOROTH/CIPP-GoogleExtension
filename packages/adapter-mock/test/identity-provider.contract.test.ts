import {
  ExpiredRefreshTokenError,
  GenericProviderError,
  NetworkTimeoutError,
  QuotaExceededError,
} from '@cipp-google/core';
import type { IdentityProviderConformanceFixture } from '@cipp-google/core/test-conformance';
import { runIdentityProviderContractSuite } from '@cipp-google/core/test-conformance';
import { describe, expect, test } from 'vitest';

import { MockAdapter } from '../src/index.js';

const fixture: IdentityProviderConformanceFixture = {
  customer: {
    id: 'customer-1',
    name: 'Contoso',
  },
  seedUsers: [
    {
      id: 'user-1',
      customerId: 'customer-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      suspended: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'user-2',
      customerId: 'customer-1',
      email: 'bob@example.com',
      displayName: 'Bob',
      suspended: false,
      createdAt: '2026-01-01T00:00:00.100Z',
      updatedAt: '2026-01-01T00:00:00.100Z',
    },
  ],
};

runIdentityProviderContractSuite({
  fixture,
  createAdapter: () => new MockAdapter({ initialUsers: [...fixture.seedUsers], latencyMs: 0 }),
  harness: { describe, test },
});

test('MockAdapter supports fault injection error classes', async () => {
  const adapter = new MockAdapter({ initialUsers: [...fixture.seedUsers], latencyMs: 0 });
  adapter.failNext('getUser', GenericProviderError);
  const generic = await adapter.getUser(fixture.customer, fixture.seedUsers[0]!.id);
  if (generic.ok) {
    expect.fail('expected generic failure');
  }
  expect(generic.error.code).toBe('generic');

  adapter.failNext('getUser', QuotaExceededError);
  const quota = await adapter.getUser(fixture.customer, fixture.seedUsers[0]!.id);
  if (quota.ok) {
    expect.fail('expected quota failure');
  }
  expect(quota.error.code).toBe('quota_exceeded');

  adapter.failNext('getUser', ExpiredRefreshTokenError);
  const expired = await adapter.getUser(fixture.customer, fixture.seedUsers[0]!.id);
  if (expired.ok) {
    expect.fail('expected expired refresh token failure');
  }
  expect(expired.error.code).toBe('expired_refresh_token');

  adapter.failNext('getUser', NetworkTimeoutError);
  const timeout = await adapter.getUser(fixture.customer, fixture.seedUsers[0]!.id);
  if (timeout.ok) {
    expect.fail('expected timeout failure');
  }
  expect(timeout.error.code).toBe('network_timeout');

  const missing = await adapter.getUser(fixture.customer, '__missing__');
  if (!missing.ok) {
    expect(missing.error.code).toBe('not_found');
  }
});

test('MockAdapter exposes latencyMs control', async () => {
  const adapter = new MockAdapter({ initialUsers: [...fixture.seedUsers], latencyMs: 20 });
  const before = Date.now();
  await adapter.listUsers(fixture.customer);
  const after = Date.now();
  expect(after - before).toBeGreaterThanOrEqual(20);
});
