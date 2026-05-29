import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { TableClient } from '@azure/data-tables';

import { createCippSyncStore, InMemoryCippSyncStore } from '../src/cipp/store.js';

describe('createCippSyncStore durable fallback policy', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('throws when durable store initialization fails and fallback is not explicitly enabled', () => {
    mock.method(TableClient, 'fromConnectionString', () => {
      throw new Error('durable init failed');
    });

    assert.throws(() =>
      createCippSyncStore({
        CIPP_WEBHOOK_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      } as NodeJS.ProcessEnv),
    /durable init failed/);
  });

  it('falls back to in-memory only when explicit fallback flag is true', () => {
    mock.method(TableClient, 'fromConnectionString', () => {
      throw new Error('durable init failed');
    });

    const store = createCippSyncStore({
      CIPP_WEBHOOK_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      CIPP_ALLOW_INMEMORY_FALLBACK: 'true',
    } as NodeJS.ProcessEnv);

    assert.ok(store instanceof InMemoryCippSyncStore);
  });
});
