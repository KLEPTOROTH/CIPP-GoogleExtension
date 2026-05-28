import { TableClient } from '@azure/data-tables';
import { BlobServiceClient } from '@azure/storage-blob';
import type { ExecuteActionAudit } from '@cipp-google/core';

import type { AuditFilter, AuditPage, AuditRecord, AuditRecordIndex, AuditStore } from './models.js';

interface CursorState {
  nextOffset: number;
}

interface AuditIndexEntity {
  partitionKey: string;
  rowKey: string;
  customerId: string;
  timestamp: string;
  actorId?: string;
  targetUserId: string;
  action: ExecuteActionAudit['action'];
  attempted: boolean;
  applied: boolean;
  m365Applied: boolean;
  googleApplied: boolean;
  status: ExecuteActionAudit['status'];
  requestId: string;
  blobPath: string;
}

export interface AzureAuditStoreConfig {
  connectionString: string;
  tableName: string;
  blobContainer: string;
}

function encodeCursor(nextOffset: number): string {
  return Buffer.from(JSON.stringify({ nextOffset } satisfies CursorState), 'utf8').toString('base64');
}

function decodeCursor(rawCursor?: string): number {
  if (!rawCursor) {
    return 0;
  }
  try {
    const decoded = Buffer.from(rawCursor, 'base64').toString('utf8');
    const value = JSON.parse(decoded) as CursorState;
    return Number.isFinite(value.nextOffset) && value.nextOffset >= 0 ? value.nextOffset : 0;
  } catch {
    return 0;
  }
}

function toMillis(iso: string): number {
  return Date.parse(iso);
}

function createRowKey(timestamp: string, requestId: string): string {
  return `${timestamp}-${requestId}`;
}

function createBlobPath(customerId: string, timestamp: string, requestId: string): string {
  return `customers/${encodeURIComponent(customerId)}/events/${timestamp}/${encodeURIComponent(requestId)}.json`;
}

function toIndexEntity(payload: ExecuteActionAudit): AuditIndexEntity {
  const timestamp = payload.startedAt || payload.finishedAt;
  const requestId = payload.correlationId;
  return {
    partitionKey: payload.customerId,
    rowKey: createRowKey(timestamp, requestId),
    customerId: payload.customerId,
    timestamp,
    actorId: payload.actorId,
    targetUserId: payload.key,
    action: payload.action,
    attempted: payload.attempted,
    applied: payload.applied,
    m365Applied: payload.m365Applied,
    googleApplied: payload.googleApplied,
    status: payload.status,
    requestId,
    blobPath: createBlobPath(payload.customerId, timestamp, requestId),
  };
}

function toIndexRecord(entity: AuditIndexEntity): AuditRecordIndex {
  return {
    customerId: entity.customerId,
    timestamp: entity.timestamp,
    actorId: entity.actorId,
    targetUserId: entity.targetUserId,
    action: entity.action,
    attempted: entity.attempted,
    applied: entity.applied,
    m365Applied: entity.m365Applied,
    googleApplied: entity.googleApplied,
    status: entity.status,
    requestId: entity.requestId,
    blobPath: entity.blobPath,
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
  };
}

function matchesFilter(record: AuditRecordIndex, filter: AuditFilter): boolean {
  if (record.customerId !== filter.customerId) {
    return false;
  }
  if (filter.actorId && record.actorId !== filter.actorId) {
    return false;
  }
  if (filter.targetUserId && record.targetUserId !== filter.targetUserId) {
    return false;
  }
  if (filter.action && record.action !== filter.action) {
    return false;
  }
  if (filter.requestId && record.requestId !== filter.requestId) {
    return false;
  }
  if (filter.from && toMillis(record.timestamp) < toMillis(filter.from)) {
    return false;
  }
  if (filter.to && toMillis(record.timestamp) > toMillis(filter.to)) {
    return false;
  }
  return true;
}

export class AzureAuditStore implements AuditStore {
  private readonly tableClient: TableClient;
  private readonly blobServiceClient: BlobServiceClient;
  private readonly blobContainer: string;

  constructor(config: AzureAuditStoreConfig) {
    this.tableClient = TableClient.fromConnectionString(config.connectionString, config.tableName);
    this.blobServiceClient = BlobServiceClient.fromConnectionString(config.connectionString);
    this.blobContainer = config.blobContainer;
  }

  public async writeAuditRecord(payload: ExecuteActionAudit): Promise<AuditRecordIndex> {
    const entity = toIndexEntity(payload);
    const containerClient = this.blobServiceClient.getContainerClient(this.blobContainer);
    await containerClient.createIfNotExists();
    await this.tableClient.createTable();
    let tableInserted = false;

    try {
      await this.tableClient.createEntity(entity);
      tableInserted = true;
    } catch (error: unknown) {
      if (!isEntityAlreadyExistsError(error)) {
        throw error;
      }
    }

    const blobClient = containerClient.getBlockBlobClient(entity.blobPath);
    const payloadJson = JSON.stringify(payload);
    try {
      await blobClient.upload(payloadJson, Buffer.byteLength(payloadJson), {
        blobHTTPHeaders: {
          blobContentType: 'application/json',
        },
        conditions: {
          ifNoneMatch: '*',
        },
      });
    } catch (error: unknown) {
      if (isBlobAlreadyExistsError(error)) {
        return toIndexRecord(entity);
      }
      if (tableInserted) {
        try {
          await this.tableClient.deleteEntity(entity.partitionKey, entity.rowKey);
        } catch {
          // Best effort cleanup to avoid index entries referencing absent payload blobs.
        }
      }
      throw error;
    }

    return toIndexRecord(entity);
  }

  public async readAudit(filter: AuditFilter): Promise<AuditPage> {
    const requestedLimit = Number.isFinite(filter.limit ?? NaN) ? (filter.limit as number) : 100;
    const limit = Math.min(Math.max(requestedLimit, 1), 500);
    const offset = decodeCursor(filter.cursor);

    const entities: AuditIndexEntity[] = [];
    const list = this.tableClient.listEntities<AuditIndexEntity>({
      queryOptions: {
        filter: `PartitionKey eq '${filter.customerId.replace(/'/g, "''")}'`,
      },
    });

    for await (const entity of list) {
      entities.push(entity);
    }

    entities.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

    const filtered = entities.map(toIndexRecord).filter((row) => matchesFilter(row, filter));
    const selected = filtered.slice(offset, offset + limit);

    const containerClient = this.blobServiceClient.getContainerClient(this.blobContainer);
    const items: AuditRecord[] = [];
    for (const row of selected) {
      const blobClient = containerClient.getBlobClient(row.blobPath);
      const download = await blobClient.download();
      const content = await streamToString(download.readableStreamBody);
      items.push({
        ...row,
        payload: JSON.parse(content) as ExecuteActionAudit,
      });
    }

    const nextOffset = offset + selected.length;
    const nextCursor = nextOffset < filtered.length ? encodeCursor(nextOffset) : undefined;

    return { items, nextCursor };
  }
}

function isEntityAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'EntityAlreadyExists'
  );
}

function isBlobAlreadyExistsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const knownCode = 'code' in error ? (error as { code?: string }).code : undefined;
  const statusCode = 'statusCode' in error ? (error as { statusCode?: number }).statusCode : undefined;
  return knownCode === 'BlobAlreadyExists' || statusCode === 412;
}

async function streamToString(readable: NodeJS.ReadableStream | null | undefined): Promise<string> {
  if (!readable) {
    return '';
  }
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
