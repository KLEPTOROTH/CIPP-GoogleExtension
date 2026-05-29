export interface CippWebhookEvent {
  eventId: string;
  eventType: 'customer.created' | 'customer.updated' | 'customer.deleted';
  customerId: string;
  displayName: string;
  cippTenantId: string;
  sourceVersion?: number;
  eventTime: string;
}

export interface CustomerMirrorRecord {
  customerId: string;
  displayName: string;
  cippTenantId: string;
  sourceVersion: number;
  lastObservedAt: string;
  lastWebhookAt?: string;
  bindingState: 'bound' | 'unbound' | 'unknown';
}

export interface ProcessResult {
  accepted: boolean;
  reason?:
    | 'duplicate'
    | 'stale'
    | 'conflict_exhausted'
    | 'replay_conflict'
    | 'invalid_signature'
    | 'invalid_payload';
}
