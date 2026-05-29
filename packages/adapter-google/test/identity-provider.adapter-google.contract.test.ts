import { type Customer } from '@cipp-google/core';
import {
  type IdentityProviderConformanceFixture,
  runIdentityProviderContractSuite,
} from '@cipp-google/core/test-conformance';
import { describe, expect, test } from 'vitest';

import { GoogleAdapter, InMemoryGoogleDirectory } from '../src/index.js';

const fixture: IdentityProviderConformanceFixture = {
  customer: {
    id: 'google-customer-1',
    name: 'Acme Google',
  },
  seedUsers: [
    {
      id: 'google-user-1',
      customerId: 'google-customer-1',
      email: 'alice@example.com',
      displayName: 'Alice Alpha',
      suspended: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      google: {
        kind: 'google',
        customerId: 'google-customer-1',
        userId: 'google-user-1',
        email: 'alice@example.com',
      },
    },
    {
      id: 'google-user-2',
      customerId: 'google-customer-1',
      email: 'bob@example.com',
      displayName: 'Bob Bravo',
      suspended: false,
      createdAt: '2026-01-01T00:00:00.001Z',
      updatedAt: '2026-01-01T00:00:00.001Z',
      google: {
        kind: 'google',
        customerId: 'google-customer-1',
        userId: 'google-user-2',
        email: 'bob@example.com',
      },
    },
  ],
};

runIdentityProviderContractSuite({
  fixture,
  createAdapter: () =>
    new GoogleAdapter({
      directory: new InMemoryGoogleDirectory(fixture.seedUsers),
      resolveBinding: async () => ({
        customerId: fixture.customer.id,
        refreshTokenSecretRef: 'kv://google/refresh-token',
      }),
    }),
  harness: { describe, test },
});

test('maps provider faults to expected contract errors', async () => {
  const customer: Customer = fixture.customer;
  const adapter = new GoogleAdapter({
    directory: {
      async listUsers() {
        throw { status: 500, message: 'boom' };
      },
      async getUser() {
        throw { status: 401, message: 'invalid_grant' };
      },
      async updateUserSuspension() {
        throw { status: 500, message: 'boom' };
      },
    },
    resolveBinding: async () => ({
      customerId: fixture.customer.id,
      refreshTokenSecretRef: 'kv://google/refresh-token',
    }),
  });

  const list = await adapter.listUsers(customer);
  expect(list.ok).toBe(false);
  expect(list.error.code).toBe('generic');

  const get = await adapter.getUser(customer, 'google-user-1');
  expect(get.ok).toBe(false);
  expect(get.error.code).toBe('expired_refresh_token');
});

test('emits requires-reauth callback when invalid_grant is returned', async () => {
  const customer: Customer = fixture.customer;
  let calledReason: string | null = null;

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
      customerId: fixture.customer.id,
      refreshTokenSecretRef: 'kv://google/refresh-token',
    }),
    setRequiresReauth: async (_customer, reason) => {
      calledReason = reason;
    },
  });

  const result = await adapter.listUsers(customer);
  expect(result.ok).toBe(false);
  expect(calledReason).toBe('invalid_grant');
});

test('emits per-call audit events with domain-wide delegation marker', async () => {
  const customer: Customer = fixture.customer;
  const events: Array<{ method: string; dwd: boolean; key?: string }> = [];

  const adapter = new GoogleAdapter({
    directory: new InMemoryGoogleDirectory(fixture.seedUsers),
    resolveBinding: async () => ({
      customerId: fixture.customer.id,
      refreshTokenSecretRef: 'kv://google/refresh-token',
    }),
    enableDomainWideDelegation: true,
    onAuditEvent: (event) => {
      events.push({ method: event.method, dwd: event.domainWideDelegationEnabled, key: event.key });
    },
  });

  const listResult = await adapter.listUsers(customer);
  expect(listResult.ok).toBe(true);
  const getResult = await adapter.getUser(customer, fixture.seedUsers[0]!.id);
  expect(getResult.ok).toBe(true);

  expect(events.some((event) => event.method === 'listUsers')).toBe(true);
  expect(events.some((event) => event.method === 'getUser')).toBe(true);
  expect(events.every((event) => event.dwd)).toBe(true);
});
