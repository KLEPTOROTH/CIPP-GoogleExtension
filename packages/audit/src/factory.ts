import { AzureAuditStore } from './azure.js';
import { InMemoryAuditStore } from './in-memory.js';
import type { AuditStore } from './models.js';

export interface AuditStoreFactoryOptions {
  requireDurable?: boolean;
}

export function createAuditStoreFromEnv(options: AuditStoreFactoryOptions = {}): AuditStore {
  const connectionString = process.env.AUDIT_STORAGE_CONNECTION_STRING;
  const tableName = process.env.AUDIT_TABLE_NAME;
  const blobContainer = process.env.AUDIT_BLOB_CONTAINER;

  if (connectionString && tableName && blobContainer) {
    return new AzureAuditStore({
      connectionString,
      tableName,
      blobContainer,
    });
  }

  if (options.requireDurable) {
    throw new Error(
      'Durable audit store is required but AUDIT_STORAGE_CONNECTION_STRING, AUDIT_TABLE_NAME, and AUDIT_BLOB_CONTAINER are not all set.',
    );
  }

  return new InMemoryAuditStore();
}
