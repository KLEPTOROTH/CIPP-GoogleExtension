import { afterEach, describe, expect, it, vi } from 'vitest';

import { TableClient } from '@azure/data-tables';

import { createCippSyncStore, InMemoryCippSyncStore } from '../src/cipp/store.js';

describe('createCippSyncStore durable fallback policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when durable store initialization fails and fallback is not explicitly enabled', () => {
    vi.spyOn(TableClient, 'fromConnectionString').mockImplementation(() => {
      throw new Error('durable init failed');
    });

    expect(() =>
      createCippSyncStore({
        CIPP_WEBHOOK_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      } as NodeJS.ProcessEnv),
    ).toThrow(/durable init failed/);
  });

  it('falls back to in-memory only when explicit fallback flag is true', () => {
    vi.spyOn(TableClient, 'fromConnectionString').mockImplementation(() => {
      throw new Error('durable init failed');
    });

    const store = createCippSyncStore({
      CIPP_WEBHOOK_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      CIPP_ALLOW_INMEMORY_FALLBACK: 'true',
    } as NodeJS.ProcessEnv);

    expect(store).toBeInstanceOf(InMemoryCippSyncStore);
  });
});
