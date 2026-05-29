import { GenericProviderError, type Customer } from '@cipp-google/core';
import { expect, test } from 'vitest';

import { GoogleAdapter, InMemoryGoogleDirectory } from '../src/index.js';

const customer: Customer = {
  id: 'customer-1',
  name: 'Contoso',
};

test('maps HTTP and timeout faults into provider errors', async () => {
  const adapter = new GoogleAdapter({
    directory: {
      async listUsers() {
        throw { status: 429, message: 'quota limit exceeded' };
      },
      async getUser() {
        throw { code: 'ETIMEDOUT', message: 'connection timeout' };
      },
      async updateUserSuspension() {
        return {
          id: 'user-1',
          primaryEmail: 'a@example.com',
          suspended: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          etag: 'etag-1',
        };
      },
    },
    resolveBinding: async () => ({
      customerId: customer.id,
      refreshTokenSecretRef: 'kv://google/refresh-token',
    }),
    requestWindowMs: 1,
    customerRateLimitPer100s: 10,
    userRateLimitPer100s: 10,
    maxQuotaRetries: 0,
  });

  const list = await adapter.listUsers(customer);
  expect(list.ok).toBe(false);
  expect(list.error.code).toBe('quota_exceeded');

  const get = await adapter.getUser(customer, 'user-1');
  expect(get.ok).toBe(false);
  expect(get.error.code).toBe('network_timeout');
});

test('bucket exhaustion returns quota_exceeded with bounded retries', async () => {
  const fixedClock = { next: () => 0 };

  const adapter = new GoogleAdapter({
    directory: new InMemoryGoogleDirectory([]),
    resolveBinding: async () => ({
      customerId: customer.id,
      refreshTokenSecretRef: 'kv://google/refresh-token',
    }),
    cacheTtlMs: 0,
    requestWindowMs: 1_000,
    customerRateLimitPer100s: 1,
    userRateLimitPer100s: 1,
    maxQuotaRetries: 0,
    now: () => fixedClock.next(),
  });

  const first = await adapter.listUsers(customer);
  expect(first.ok).toBe(true);

  const second = await adapter.listUsers(customer);
  expect(second.ok).toBe(false);
  expect(second.error.code).toBe('quota_exceeded');
});

test('invalid mapping path falls back to generic provider error', async () => {
  const adapter = new GoogleAdapter({
    directory: {
      async listUsers() {
        throw { code: 'unexpected' };
      },
      async getUser() {
        return null;
      },
      async updateUserSuspension() {
        return {
          id: 'user-1',
          primaryEmail: 'a@example.com',
          suspended: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          etag: 'etag-1',
        };
      },
    },
    resolveBinding: async () => ({
      customerId: customer.id,
      refreshTokenSecretRef: 'kv://google/refresh-token',
    }),
  });

  const list = await adapter.listUsers(customer);
  expect(list.ok).toBe(false);
  expect(list.error.code).toBe('generic');
  expect(list.error.message).toBe('unexpected');
  expect(list.error).toBeInstanceOf(GenericProviderError);
});

test('invalid_grant still returns expired_refresh_token if requires-reauth callback fails', async () => {
  const adapter = new GoogleAdapter({
    directory: {
      async listUsers() {
        throw { status: 401, message: 'invalid_grant' };
      },
      async getUser() {
        return null;
      },
      async updateUserSuspension() {
        throw { status: 500, message: 'boom' };
      },
    },
    resolveBinding: async () => ({
      customerId: customer.id,
      refreshTokenSecretRef: 'kv://google/refresh-token',
    }),
    setRequiresReauth: async () => {
      throw new Error('callback write failed');
    },
  });

  const result = await adapter.listUsers(customer);
  expect(result.ok).toBe(false);
  expect(result.error.code).toBe('expired_refresh_token');
});
