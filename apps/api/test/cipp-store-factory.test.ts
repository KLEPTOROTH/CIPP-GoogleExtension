import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { TableClient } from '@azure/data-tables';

import { createCippSyncStore, InMemoryCippSyncStore } from '../src/cipp/store.js';

describe('createCippSyncStore durable fallback policy', () => {
  const originalFromConnectionString = TableClient.fromConnectionString;

  afterEach(() => {
    TableClient.fromConnectionString = originalFromConnectionString;
  });

  it('throws when durable store initialization fails and fallback is not explicitly enabled', () => {
    TableClient.fromConnectionString = (() => {
      throw new Error('durable init failed');
    }) as typeof TableClient.fromConnectionString;

    assert.throws(
      () =>
      createCippSyncStore({
        CIPP_WEBHOOK_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      } as NodeJS.ProcessEnv),
      /durable init failed/,
    );
  });

  it('falls back to in-memory only when explicit fallback flag is true', () => {
    TableClient.fromConnectionString = (() => {
      throw new Error('durable init failed');
    }) as typeof TableClient.fromConnectionString;

    const store = createCippSyncStore({
      CIPP_WEBHOOK_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      CIPP_ALLOW_INMEMORY_FALLBACK: 'true',
    } as NodeJS.ProcessEnv);

    assert.ok(store instanceof InMemoryCippSyncStore);
  });
});
