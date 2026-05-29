import { describe, expect, it } from 'vitest';

import {
  CippConnectService,
  InMemoryCippConnectionStore,
} from '../src/cipp/connect.js';
import { InMemoryCippSyncStore } from '../src/cipp/store.js';

function createService(customers = [{ id: 'cust-1', name: 'Acme' }]) {
  const syncStore = new InMemoryCippSyncStore(() => '2026-05-29T00:00:00.000Z');
  const service = new CippConnectService({
    integrationStore: new InMemoryCippConnectionStore(),
    syncStore,
    env: {
      CIPP_API_SECRET_REF: 'kv://cipp/token',
      CIPP_API_TOKEN: 'super-secret-value',
    } as NodeJS.ProcessEnv,
    now: () => '2026-05-29T00:00:00.000Z',
    adapterFactory: () => ({
      async listCustomers() {
        return { ok: true, value: customers };
      },
    }),
  });

  return { service, syncStore };
}

describe('cipp connect lifecycle', () => {
  it('rejects invalid URL before saving credential reference', async () => {
    const { service } = createService();

    const result = await service.connect({
      baseUrl: 'http://insecure.example.test',
      secretRef: 'kv://cipp/token',
    });

    expect(result.validation.ok).toBe(false);
    expect(result.validation.error?.code).toBe('INVALID_URL');
    expect((await service.status()).status).toBe('disconnected');
    expect((await service.status()).secretRef).toBeUndefined();
  });

  it('connects and imports deterministic customer mirrors without storing secret bytes', async () => {
    const { service } = createService();

    const result = await service.connect({
      baseUrl: 'https://cipp.example.test/',
      secretRef: 'kv://cipp/token',
    });

    const status = await service.status();
    const customers = await service.customers();

    expect(result.validation.ok).toBe(true);
    expect(status.status).toBe('connected');
    expect(status.secretRef).toBe('kv://cipp/token');
    expect(JSON.stringify(status)).not.toContain('super-secret-value');
    expect(customers).toEqual([
      {
        customerId: 'cust-1',
        displayName: 'Acme',
        cippTenantId: 'cust-1',
        sourceVersion: 0,
        lastObservedAt: '2026-05-29T00:00:00.000Z',
        bindingState: 'bound',
      },
    ]);
  });

  it('keeps customer mappings stable across reconnect', async () => {
    const { service } = createService();
    await service.connect({
      baseUrl: 'https://cipp.example.test',
      secretRef: 'kv://cipp/token',
    });
    const before = await service.customers();

    const reconnect = await service.reconnect({
      baseUrl: 'https://cipp.example.test',
      secretRef: 'kv://cipp/token',
    });
    const after = await service.customers();

    expect(reconnect.validation.ok).toBe(true);
    expect(after).toEqual(before);
  });

  it('disconnects without deleting mirror rows', async () => {
    const { service } = createService();
    await service.connect({
      baseUrl: 'https://cipp.example.test',
      secretRef: 'kv://cipp/token',
    });

    await service.disconnect();

    expect((await service.status()).status).toBe('disconnected');
    expect(await service.customers()).toHaveLength(1);
  });
});
