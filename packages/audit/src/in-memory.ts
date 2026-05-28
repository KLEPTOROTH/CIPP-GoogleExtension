import { randomUUID } from 'node:crypto';

import type { ExecuteActionAudit } from '@cipp-google/core';

import type {
  AuditCursor,
  AuditFilter,
  AuditPage,
  AuditRecord,
  AuditRecordIndex,
  AuditStore,
} from './models.js';

interface AuditIndexEntry {
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
  partitionKey: string;
  rowKey: string;
}

interface AuditBlobPayload {
  [blobPath: string]: ExecuteActionAudit;
}

interface CursorState {
  nextOffset: number;
}

function encodeCursor(nextOffset: number): AuditCursor {
  return Buffer.from(JSON.stringify({ nextOffset }), 'utf8').toString('base64');
}

function decodeCursor(rawCursor?: string): number {
  if (!rawCursor) {
    return 0;
  }
  try {
    const decoded = Buffer.from(rawCursor, 'base64').toString('utf8');
    const value = JSON.parse(decoded) as CursorState;
    return Number.isFinite(value?.nextOffset) && value.nextOffset >= 0 ? value.nextOffset : 0;
  } catch {
    return 0;
  }
}

function normalizeTime(value: string): number {
  return Date.parse(value);
}

function sanitizeBlobPathCustomer(customerId: string): string {
  return encodeURIComponent(customerId);
}

function composeBlobPath(
  customerId: string,
  timestamp: string,
  actorId: string | undefined,
  eventId: string,
): string {
  const safeActor = encodeURIComponent(actorId ?? 'unknown');
  return `customers/${sanitizeBlobPathCustomer(customerId)}/events/${timestamp}/${safeActor}/${eventId}.json`;
}

function toRowKey(timestamp: string, eventId: string): string {
  return `${timestamp}-${eventId}`;
}

export class InMemoryAuditStore implements AuditStore {
  private readonly bucketsByCustomer = new Map<string, AuditIndexEntry[]>();
  private readonly payloadByPath: AuditBlobPayload = Object.create(null);

  public async writeAuditRecord(payload: ExecuteActionAudit): Promise<AuditRecordIndex> {
    const row = this.toIndex(payload);
    const customerBucket = this.bucketsByCustomer.get(payload.customerId) ?? [];

    const insertionIndex = this.findInsertionPoint(customerBucket, row.timestamp);
    customerBucket.splice(insertionIndex, 0, row);
    this.bucketsByCustomer.set(payload.customerId, customerBucket);

    this.payloadByPath[row.blobPath] = structuredClone(payload);

    return row;
  }

  public async readAudit(filter: AuditFilter): Promise<AuditPage> {
    const requestedLimit = Number.isFinite(filter.limit ?? NaN) ? (filter.limit as number) : 100;
    const limit = Math.min(Math.max(requestedLimit, 1), 500);
    const offset = decodeCursor(filter.cursor);

    const rows = this.bucketsByCustomer.get(filter.customerId) ?? [];
    const filtered = rows.filter((row) => {
      if (filter.actorId && row.actorId !== filter.actorId) {
        return false;
      }
      if (filter.targetUserId && row.targetUserId !== filter.targetUserId) {
        return false;
      }
      if (filter.action && row.action !== filter.action) {
        return false;
      }
      if (filter.requestId && row.requestId !== filter.requestId) {
        return false;
      }
      if (filter.from && normalizeTime(row.timestamp) < normalizeTime(filter.from)) {
        return false;
      }
      if (filter.to && normalizeTime(row.timestamp) > normalizeTime(filter.to)) {
        return false;
      }
      return true;
    });

    const slice = filtered.slice(offset, offset + limit);
    const items: AuditRecord[] = slice
      .map((row) => {
        const payload = this.payloadByPath[row.blobPath];
        if (!payload) {
          return undefined;
        }
        return {
          ...row,
          payload,
        };
      })
      .filter((item): item is AuditRecord => item !== undefined);

    const nextOffset = offset + slice.length;
    const nextCursor = nextOffset < filtered.length ? encodeCursor(nextOffset) : undefined;

    return {
      items,
      nextCursor,
    };
  }

  private toIndex(payload: ExecuteActionAudit): AuditRecordIndex {
    const now = payload.startedAt || payload.finishedAt;
    const eventId = randomUUID();
    const blobPath = composeBlobPath(payload.customerId, now, payload.actorId, eventId);
    const rowKey = toRowKey(now, eventId);
    return {
      customerId: payload.customerId,
      timestamp: now,
      actorId: payload.actorId,
      targetUserId: payload.key,
      action: payload.action,
      attempted: payload.attempted,
      applied: payload.applied,
      m365Applied: payload.m365Applied,
      googleApplied: payload.googleApplied,
      status: payload.status,
      requestId: payload.correlationId,
      blobPath,
      partitionKey: payload.customerId,
      rowKey,
    };
  }

  private findInsertionPoint(rows: AuditIndexEntry[], timestamp: string): number {
    let low = 0;
    let high = rows.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (rows[mid]!.timestamp <= timestamp) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }
}
