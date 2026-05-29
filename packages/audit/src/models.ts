import type { ExecuteActionAudit } from '@cipp-google/core';

export type AuditActionFilter = ExecuteActionAudit['action'];

export type AuditCursor = string;

export interface AuditRecordIndex {
  customerId: string;
  timestamp: string;
  actorId?: string;
  targetUserId: string;
  action: AuditActionFilter;
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

export interface AuditPayload extends ExecuteActionAudit {}

export interface AuditRecord extends AuditRecordIndex {
  payload: AuditPayload;
}

export interface AuditFilter {
  customerId: string;
  actorId?: string;
  targetUserId?: string;
  action?: AuditActionFilter;
  from?: string;
  to?: string;
  requestId?: string;
  limit?: number;
  cursor?: AuditCursor;
}

export interface AuditPage {
  items: AuditRecord[];
  nextCursor?: AuditCursor;
}

export interface AuditStore {
  writeAuditRecord(payload: ExecuteActionAudit): Promise<AuditRecordIndex>;
  readAudit(filter: AuditFilter): Promise<AuditPage>;
}
