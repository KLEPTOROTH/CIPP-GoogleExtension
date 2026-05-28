import { describe, expect, it } from 'vitest';

import { CippAdapter } from '../src/index.js';

describe('CippAdapter', () => {
  it('maps customer list response into core Customer shape', async () => {
    const adapter = new CippAdapter({
      baseUrl: 'https://cipp.example.test',
      apiToken: 'token',
      fetchImpl: async () =>
        new Response(JSON.stringify([{ id: 'cust-1', name: 'Acme MSP' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const result = await adapter.listCustomers();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ id: 'cust-1', name: 'Acme MSP' }]);
    }
  });

  it('maps 404 responses to typed not_found provider error', async () => {
    const adapter = new CippAdapter({
      baseUrl: 'https://cipp.example.test',
      apiToken: 'token',
      fetchImpl: async () => new Response('', { status: 404 }),
    });

    const result = await adapter.getUser({ id: 'cust-1', name: 'Acme MSP' }, 'user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
      expect(result.error.retryable).toBe(false);
    }
  });

  it('maps non-timeout http failures to generic provider error', async () => {
    const adapter = new CippAdapter({
      baseUrl: 'https://cipp.example.test',
      apiToken: 'token',
      fetchImpl: async () => new Response('server error', { status: 500 }),
    });

    const result = await adapter.listCustomers();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('generic');
      expect(result.error.message).toBe('cipp_http_500');
    }
  });

  it('rejects malformed provider payload schema', async () => {
    const adapter = new CippAdapter({
      baseUrl: 'https://cipp.example.test',
      apiToken: 'token',
      fetchImpl: async () =>
        new Response(JSON.stringify([{ id: 7, title: 'wrong-shape' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const result = await adapter.listCustomers();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('generic');
      expect(result.error.message).toBe('cipp_invalid_payload');
    }
  });
});
