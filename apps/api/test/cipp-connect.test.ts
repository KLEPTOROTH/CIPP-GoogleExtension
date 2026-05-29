import { describe, expect, it } from 'vitest';

import {
  CippConnectService,
  DurableCippConnectionStore,
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

class FakeConnectionTableClient {
  constructor(private readonly rows: Map<string, Record<string, unknown>>) {}

  async getEntity<T extends object>(partitionKey: string, rowKey: string): Promise<T> {
    const row = this.rows.get(`${partitionKey}:${rowKey}`);
    if (!row) {
      const error = new Error('not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'ResourceNotFound';
      throw error;
    }
    return { ...row } as T;
  }

  async upsertEntity(entity: Record<string, unknown>): Promise<void> {
    this.rows.set(`${entity.PartitionKey}:${entity.RowKey}`, { ...entity });
  }
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

  it('keeps connection metadata durable across fresh service instances without storing secret bytes', async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const env = {
      CIPP_API_SECRET_REF: 'kv://cipp/token',
      CIPP_API_TOKEN: 'super-secret-value',
    } as NodeJS.ProcessEnv;
    const customers = [{ id: 'cust-1', name: 'Acme' }];
    const adapterFactory = () => ({
      async listCustomers() {
        return { ok: true as const, value: customers };
      },
    });

    const firstStore = new DurableCippConnectionStore({
      storageConnectionString: 'UseDevelopmentStorage=true',
      client: new FakeConnectionTableClient(rows),
      ensureTable: async () => {},
    });
    const firstService = new CippConnectService({
      integrationStore: firstStore,
      syncStore: new InMemoryCippSyncStore(() => '2026-05-29T00:00:00.000Z'),
      env,
      now: () => '2026-05-29T00:00:00.000Z',
      adapterFactory,
    });

    await firstService.connect({
      baseUrl: 'https://cipp.example.test/',
      secretRef: 'kv://cipp/token',
    });

    const restartedStore = new DurableCippConnectionStore({
      storageConnectionString: 'UseDevelopmentStorage=true',
      client: new FakeConnectionTableClient(rows),
      ensureTable: async () => {},
    });
    const restartedSyncStore = new InMemoryCippSyncStore(() => '2026-05-29T00:01:00.000Z');
    const restartedService = new CippConnectService({
      integrationStore: restartedStore,
      syncStore: restartedSyncStore,
      env,
      now: () => '2026-05-29T00:01:00.000Z',
      adapterFactory,
    });

    const status = await restartedService.status();
    const reconnect = await restartedService.reconnect({
      baseUrl: 'https://cipp.example.test/',
      secretRef: 'kv://cipp/token',
    });
    const imported = await restartedService.importCustomers();
    const persistedRows = JSON.stringify([...rows.values()]);

    expect(status).toMatchObject({
      baseUrl: 'https://cipp.example.test',
      secretRef: 'kv://cipp/token',
      status: 'connected',
      lastValidatedAt: '2026-05-29T00:00:00.000Z',
    });
    expect(reconnect.validation.ok).toBe(true);
    expect(imported.summary.imported).toBe(1);
    expect(persistedRows).toContain('kv://cipp/token');
    expect(persistedRows).not.toContain('super-secret-value');
    expect(await restartedSyncStore.snapshot()).toHaveLength(1);
  });
});
