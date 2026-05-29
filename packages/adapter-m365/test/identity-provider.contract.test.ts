import {
  type IdentityProviderConformanceFixture,
  runIdentityProviderContractSuite,
} from '@cipp-google/core/test-conformance';
import { describe, expect, test } from 'vitest';

import { M365Adapter } from '../src/index.js';

import recordedFixture from './fixtures/graph.http.fixture.json';

type GraphFixtureValue = {
  value: Record<string, unknown>[];
};

type GraphFixtureUser = Record<string, unknown>;

interface GraphFixture {
  tenantId: string;
  token: string;
  listUsers: GraphFixtureValue;
  getUser: GraphFixtureUser;
}

const fixture: IdentityProviderConformanceFixture = {
  customer: {
    id: 'customer-gst9',
    name: 'Contoso',
  },
  seedUsers: [
    {
      id: 'm365-user-1',
      customerId: 'customer-gst9',
      email: 'alice@example.com',
      displayName: 'Alice One',
      suspended: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      m365: {
        kind: 'm365',
        tenantId: 'tenant-gst9',
        userId: 'm365-user-1',
        upn: 'alice@example.com',
      },
    },
  ],
};

function createGraphFixture(): GraphFixture {
  const jsonFixture = recordedFixture as {
    tenantId: string;
    token: string;
    listUsers: GraphFixtureValue;
    getUser: { value: GraphFixtureUser };
  };

  return {
    tenantId: jsonFixture.tenantId,
    token: jsonFixture.token,
    listUsers: jsonFixture.listUsers,
    getUser: jsonFixture.getUser.value,
  };
}

function createMockGraphClient(fixtureData: GraphFixture) {
  const callCounts: Record<string, number> = {};

  return {
    fetch: async (input: string, init?: RequestInit): Promise<Response> => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = new URL(input);
      const key = `${method} ${url.pathname}`;
      const count = (callCounts[key] ?? 0) + 1;
      callCounts[key] = count;

      if (method === 'GET' && url.pathname === '/v1.0/users') {
        return Response.json(fixtureData.listUsers, { status: 200 });
      }

      if (method === 'GET' && url.pathname === '/v1.0/users/m365-user-1') {
        const headers = (init?.headers ?? {}) as Record<string, string> | Headers;
        const etag =
          headers instanceof Headers
            ? headers.get('If-None-Match')
            : (headers['If-None-Match'] ?? headers['if-none-match']);
        if (count > 1 && etag) {
          return new Response(null, { status: 304, headers: { etag: 'W/"v1"' } });
        }

        return Response.json(fixtureData.getUser, { status: 200, headers: { etag: 'W/"v1"' } });
      }

      if (method === 'PATCH' && url.pathname === '/v1.0/users/m365-user-1') {
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({ error: { message: 'not found' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    },
    callCounts,
  };
}

runIdentityProviderContractSuite({
  fixture,
  createAdapter: async () => {
    const fixtureData = createGraphFixture();
    const mockClient = createMockGraphClient(fixtureData);

    return new M365Adapter({
      tenantIdProvider: async () => fixtureData.tenantId,
      tokenProvider: async () => fixtureData.token,
      fetch: mockClient.fetch,
    });
  },
  harness: { describe, test },
});

test('M365Adapter applies ETag-aware reads with 30s TTL', async () => {
  let now = 1;
  const fixtureData = createGraphFixture();
  const mockClient = createMockGraphClient(fixtureData);

  const adapter = new M365Adapter({
    tenantIdProvider: async () => fixtureData.tenantId,
    tokenProvider: async () => fixtureData.token,
    fetch: mockClient.fetch,
    clock: () => now,
    etagTtlMs: 30_000,
  });

  const first = await adapter.getUser(fixture.customer, 'm365-user-1');
  if (!first.ok) {
    throw new Error('first getUser should succeed');
  }

  const second = await adapter.getUser(fixture.customer, 'm365-user-1');
  if (!second.ok) {
    throw new Error('second getUser should succeed');
  }

  expect(second.value.updatedAt).toBe(first.value.updatedAt);
  expect(mockClient.callCounts['GET /v1.0/users/m365-user-1']).toBe(2);

  now += 30_001;
  const third = await adapter.getUser(fixture.customer, 'm365-user-1');
  if (!third.ok) {
    throw new Error('third getUser should succeed after TTL expiration');
  }

  expect(third.value.updatedAt).toBe(first.value.updatedAt);
  expect(mockClient.callCounts['GET /v1.0/users/m365-user-1']).toBe(3);
});

test('M365Adapter maps throttled Graph responses to a retryable failure', async () => {
  const fixtureData = createGraphFixture();
  const adapter = new M365Adapter({
    tenantIdProvider: async () => fixtureData.tenantId,
    tokenProvider: async () => fixtureData.token,
    fetch: async () =>
      new Response(JSON.stringify({ error: { message: 'too many requests' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    maxThrottleRetries: 0,
  });

  const result = await adapter.listUsers(fixture.customer);
  if (result.ok) {
    throw new Error('expected throttled failure');
  }

  expect(result.error.code).toBe('quota_exceeded');
});
