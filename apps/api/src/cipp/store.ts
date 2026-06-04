import { createHash } from 'node:crypto';

import { TableClient, TableServiceClient, type TableEntity } from '@azure/data-tables';

import type { CippWebhookEvent, CustomerMirrorRecord, ProcessResult } from './types.js';

const MIRROR_PARTITION_KEY = 'mirror';
const EVENT_PARTITION_KEY = 'events';

interface DurableCippSyncStoreOptions {
  storageConnectionString: string;
  mirrorTableName: string;
  eventTableName: string;
  now?: () => string;
}

export interface CippSyncStore {
  snapshot(): Promise<CustomerMirrorRecord[]>;
  getCustomer(customerId: string): Promise<CustomerMirrorRecord | undefined>;
  enqueueWebhookEvent(event: CippWebhookEvent): Promise<ProcessResult>;
  applyWebhookEvent(event: CippWebhookEvent): Promise<ProcessResult>;
  drainWebhookEvents(limit?: number): Promise<{
    applied: number;
    skipped: number;
    stale: number;
    duplicate: number;
    replayConflicts: number;
  }>;
  reconcileFromSnapshot(remote: readonly CustomerMirrorRecord[]): Promise<{ repaired: number }>;
}

interface EventRecord {
  customerId: string;
  eventType: CippWebhookEvent['eventType'];
  eventId: string;
  payloadHash: string;
  sourceVersion: number;
  displayName: string;
  cippTenantId: string;
  eventTime: string;
  firstSeenAt: string;
  processedAt?: string;
  status: 'received' | 'processing' | 'applied' | 'duplicate' | 'stale' | 'replay_conflict';
  etag?: string;
}

interface RawMirrorEntity extends TableEntity {
  PartitionKey: string;
  RowKey: string;
  customerId: string;
  displayName: string;
  cippTenantId: string;
  sourceVersion: number;
  lastObservedAt: string;
  lastWebhookAt: string;
  bindingState: CustomerMirrorRecord['bindingState'];
  etag?: string;
}

interface RawEventEntity extends TableEntity {
  PartitionKey: string;
  RowKey: string;
  partitionKey: string;
  rowKey: string;
  customerId: string;
  eventType: CippWebhookEvent['eventType'];
  eventId: string;
  payloadHash: string;
  sourceVersion: number;
  displayName: string;
  cippTenantId: string;
  eventTime: string;
  firstSeenAt: string;
  processedAt?: string;
  status: EventRecord['status'];
}

function nowIso(now: () => string): string {
  return now();
}

function normalizeBindingState(
  eventType: CippWebhookEvent['eventType'],
): CustomerMirrorRecord['bindingState'] {
  return eventType === 'customer.deleted' ? 'unbound' : 'bound';
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isConflictError(error: unknown): boolean {
  const candidate = error as { code?: string; statusCode?: number; status?: number };
  const code = candidate?.code;
  const statusCode = candidate?.statusCode ?? candidate?.status;
  return statusCode === 409 || code === 'Conflict' || code === 'EntityAlreadyExists';
}

function isNotFoundError(error: unknown): boolean {
  const candidate = error as { code?: string; statusCode?: number; status?: number };
  const code = candidate?.code;
  const statusCode = candidate?.statusCode ?? candidate?.status;
  return statusCode === 404 || code === 'ResourceNotFound';
}

function hashEvent(event: CippWebhookEvent): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

function mapMirrorEntity(entity: RawMirrorEntity): CustomerMirrorRecord {
  return {
    customerId: entity.customerId,
    displayName: entity.displayName,
    cippTenantId: entity.cippTenantId,
    sourceVersion: asNumber(entity.sourceVersion),
    lastObservedAt: entity.lastObservedAt,
    lastWebhookAt: entity.lastWebhookAt,
    bindingState: entity.bindingState,
  };
}

function mapEventEntity(entity: RawEventEntity): EventRecord {
  const etag = (entity as { etag?: string }).etag;
  return {
    customerId: entity.customerId,
    eventType: entity.eventType,
    eventId: entity.eventId,
    payloadHash: entity.payloadHash,
    sourceVersion: asNumber(entity.sourceVersion),
    displayName: entity.displayName,
    cippTenantId: entity.cippTenantId,
    eventTime: entity.eventTime,
    firstSeenAt: entity.firstSeenAt,
    processedAt: entity.processedAt,
    status: entity.status,
    etag,
  };
}

function toEventRecord(
  event: CippWebhookEvent,
  payloadHash: string,
  firstSeenAt: string,
): EventRecord {
  return {
    customerId: event.customerId,
    eventType: event.eventType,
    eventId: event.eventId,
    payloadHash,
    sourceVersion: event.sourceVersion ?? 0,
    displayName: event.displayName,
    cippTenantId: event.cippTenantId,
    eventTime: event.eventTime,
    firstSeenAt,
    status: 'received',
  };
}

function toWebhookEvent(event: EventRecord): CippWebhookEvent {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    customerId: event.customerId,
    displayName: event.displayName,
    cippTenantId: event.cippTenantId,
    sourceVersion: event.sourceVersion,
    eventTime: event.eventTime,
  };
}

const DEFAULT_MIRROR_TABLE = 'cipp_customer_mirror';
const DEFAULT_WEBHOOK_EVENT_TABLE = 'cipp_webhook_events';

export class InMemoryCippSyncStore implements CippSyncStore {
  private readonly mirror = new Map<string, CustomerMirrorRecord>();
  private readonly webhookEvents = new Map<string, EventRecord>();

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  snapshot(): Promise<CustomerMirrorRecord[]> {
    return Promise.resolve([...this.mirror.values()]);
  }

  getCustomer(customerId: string): Promise<CustomerMirrorRecord | undefined> {
    return Promise.resolve(this.mirror.get(customerId));
  }

  async enqueueWebhookEvent(event: CippWebhookEvent): Promise<ProcessResult> {
    const payloadHash = hashEvent(event);
    const now = nowIso(this.now);
    const existing = this.webhookEvents.get(event.eventId);

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return { accepted: false, reason: 'replay_conflict' };
      }

      return { accepted: false, reason: 'duplicate' };
    }

    this.webhookEvents.set(event.eventId, toEventRecord(event, payloadHash, now));

    return { accepted: true };
  }

  async applyWebhookEvent(event: CippWebhookEvent): Promise<ProcessResult> {
    const scheduled = await this.enqueueWebhookEvent(event);
    if (!scheduled.accepted) {
      return scheduled;
    }
    const queued = this.webhookEvents.get(event.eventId);
    if (queued && queued.status === 'received') {
      this.webhookEvents.set(event.eventId, { ...queued, status: 'processing' });
    }
    return this.applyQueuedEvent(
      event,
      nowIso(this.now),
    );
  }

  async drainWebhookEvents(limit = 50): Promise<{
    applied: number;
    skipped: number;
    stale: number;
    duplicate: number;
    replayConflicts: number;
  }> {
    const received = [...this.webhookEvents.values()]
      .filter((entry) => entry.status === 'received')
      .slice(0, limit);
    let applied = 0;
    let skipped = 0;
    let stale = 0;
    let duplicate = 0;
    let replayConflicts = 0;
    const now = nowIso(this.now);

    const claimed: EventRecord[] = [];
    for (const entry of received) {
      const existing = this.webhookEvents.get(entry.eventId);
      if (!existing || existing.status !== 'received') {
        continue;
      }
      const claimedEntry = { ...existing, status: 'processing' as const };
      this.webhookEvents.set(entry.eventId, claimedEntry);
      claimed.push(claimedEntry);
    }

    for (const entry of claimed) {
      const event = toWebhookEvent(entry);
      const result = await this.applyQueuedEvent(event, now);
      if (result.accepted) {
        applied += 1;
        continue;
      }

      skipped += 1;
      switch (result.reason) {
        case 'stale':
          stale += 1;
          break;
        case 'duplicate':
          duplicate += 1;
          break;
        case 'replay_conflict':
          replayConflicts += 1;
          break;
        default:
          break;
      }
    }

    return { applied, skipped, stale, duplicate, replayConflicts };
  }

  private async applyQueuedEvent(
    event: CippWebhookEvent,
    observedAt: string,
  ): Promise<ProcessResult> {
    const queueRecord = this.webhookEvents.get(event.eventId);
    if (!queueRecord) {
      return { accepted: false, reason: 'replay_conflict' };
    }

    if (queueRecord.status !== 'processing') {
      return {
        accepted: false,
        reason: queueRecord.status === 'replay_conflict' ? 'replay_conflict' : 'duplicate',
      };
    }

    const existing = this.mirror.get(event.customerId);
    const incomingVersion = event.sourceVersion ?? 0;
    if (existing && incomingVersion < existing.sourceVersion) {
      this.webhookEvents.set(event.eventId, {
        ...queueRecord,
        status: 'stale',
        processedAt: nowIso(this.now),
      });
      return { accepted: false, reason: 'stale' };
    }

    this.mirror.set(event.customerId, {
      customerId: event.customerId,
      displayName: event.displayName,
      cippTenantId: event.cippTenantId,
      sourceVersion: incomingVersion,
      lastObservedAt: observedAt,
      lastWebhookAt: event.eventTime,
      bindingState: normalizeBindingState(event.eventType),
    });
    this.webhookEvents.set(event.eventId, {
      ...queueRecord,
      status: 'applied',
      processedAt: nowIso(this.now),
    });

    return { accepted: true };
  }

  reconcileFromSnapshot(remote: readonly CustomerMirrorRecord[]): Promise<{ repaired: number }> {
    let repaired = 0;
    const remoteIds = new Set(remote.map((row) => row.customerId));

    for (const record of remote) {
      const local = this.mirror.get(record.customerId);
      const fieldsChanged =
        !!local &&
        (local.displayName !== record.displayName ||
          local.cippTenantId !== record.cippTenantId ||
          local.bindingState !== record.bindingState);
      if (
        !local ||
        local.sourceVersion < record.sourceVersion ||
        (local.sourceVersion === record.sourceVersion && fieldsChanged)
      ) {
        this.mirror.set(record.customerId, {
          ...record,
          lastObservedAt: nowIso(this.now),
        });
        repaired += 1;
      }
    }

    for (const local of this.mirror.values()) {
      if (remoteIds.has(local.customerId) || local.bindingState === 'unbound') {
        continue;
      }

      this.mirror.set(local.customerId, {
        ...local,
        bindingState: 'unbound',
        lastObservedAt: nowIso(this.now),
      });
      repaired += 1;
    }

    return Promise.resolve({ repaired });
  }
}

export class DurableCippSyncStore implements CippSyncStore {
  private readonly mirrorClient: TableClient;
  private readonly eventClient: TableClient;
  private readonly mirrorTableName: string;
  private readonly eventTableName: string;
  private readonly now: () => string;

  constructor(options: DurableCippSyncStoreOptions) {
    this.mirrorClient = TableClient.fromConnectionString(
      options.storageConnectionString,
      options.mirrorTableName,
    );
    this.eventClient = TableClient.fromConnectionString(
      options.storageConnectionString,
      options.eventTableName,
    );
    this.mirrorTableName = options.mirrorTableName;
    this.eventTableName = options.eventTableName;
    this.now = options.now ?? (() => new Date().toISOString());
    void this.ensureTables(options.storageConnectionString);
  }

  async snapshot(): Promise<CustomerMirrorRecord[]> {
    await this.ensureTables();

    try {
      const entities = this.mirrorClient.listEntities<RawMirrorEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${MIRROR_PARTITION_KEY}'`,
        },
      });
      const result: CustomerMirrorRecord[] = [];
      for await (const entity of entities) {
        result.push(mapMirrorEntity(entity));
      }
      return result;
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  async getCustomer(customerId: string): Promise<CustomerMirrorRecord | undefined> {
    try {
      const entity = await this.mirrorClient.getEntity<RawMirrorEntity>(
        MIRROR_PARTITION_KEY,
        customerId,
      );
      return mapMirrorEntity(entity);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async enqueueWebhookEvent(event: CippWebhookEvent): Promise<ProcessResult> {
    await this.ensureTables();
    const payloadHash = hashEvent(event);
    const now = nowIso(this.now);
    const eventEntity = this.buildEventEntity({
      event,
      payloadHash,
      firstSeenAt: now,
      status: 'received',
    });
    try {
      await this.eventClient.createEntity(eventEntity);
      return { accepted: true };
    } catch (error) {
      if (!isConflictError(error)) {
        throw error;
      }

      const existing = await this.getEvent(event.eventId);
      if (!existing) {
        return { accepted: false, reason: 'replay_conflict' };
      }
      if (existing.payloadHash !== payloadHash) {
        return { accepted: false, reason: 'replay_conflict' };
      }
      return { accepted: false, reason: 'duplicate' };
    }
  }

  async applyWebhookEvent(event: CippWebhookEvent): Promise<ProcessResult> {
    const scheduled = await this.enqueueWebhookEvent(event);
    if (!scheduled.accepted) {
      return scheduled;
    }
    const queued = await this.getEvent(event.eventId);
    if (!queued) {
      return { accepted: false, reason: 'replay_conflict' };
    }
    const claimed = await this.claimEventForProcessing(queued);
    if (!claimed) {
      return { accepted: false, reason: 'duplicate' };
    }
    return this.applyQueuedEvent(event, nowIso(this.now));
  }

  async drainWebhookEvents(limit = 50): Promise<{
    applied: number;
    skipped: number;
    stale: number;
    duplicate: number;
    replayConflicts: number;
  }> {
    await this.ensureTables();
    const items = await this.listWebhookEvents(limit);
    let applied = 0;
    let skipped = 0;
    let stale = 0;
    let duplicate = 0;
    let replayConflicts = 0;

    for (const eventRecord of items) {
      const claimed = await this.claimEventForProcessing(eventRecord);
      if (!claimed) {
        continue;
      }
      const event = toWebhookEvent(eventRecord);
      const result = await this.applyQueuedEvent(event, nowIso(this.now));
      if (result.accepted) {
        applied += 1;
        continue;
      }
      skipped += 1;
      switch (result.reason) {
        case 'stale':
          stale += 1;
          break;
        case 'duplicate':
          duplicate += 1;
          break;
        case 'replay_conflict':
          replayConflicts += 1;
          break;
        default:
          break;
      }
    }

    return { applied, skipped, stale, duplicate, replayConflicts };
  }

  async reconcileFromSnapshot(
    remote: readonly CustomerMirrorRecord[],
  ): Promise<{ repaired: number }> {
    await this.ensureTables();

    const local = await this.snapshot();
    const byId = new Map(local.map((row) => [row.customerId, row] as const));
    const remoteIds = new Set(remote.map((row) => row.customerId));
    let repaired = 0;

    for (const record of remote) {
      const localRow = byId.get(record.customerId);
      const fieldsChanged =
        !!localRow &&
        (localRow.displayName !== record.displayName ||
          localRow.cippTenantId !== record.cippTenantId ||
          localRow.bindingState !== record.bindingState);
      if (
        !localRow ||
        localRow.sourceVersion < record.sourceVersion ||
        (localRow.sourceVersion === record.sourceVersion && fieldsChanged)
      ) {
        await this.upsertMirror({
          customerId: record.customerId,
          displayName: record.displayName,
          cippTenantId: record.cippTenantId,
          sourceVersion: record.sourceVersion,
          lastObservedAt: nowIso(this.now),
          lastWebhookAt: record.lastWebhookAt ?? nowIso(this.now),
          bindingState: record.bindingState,
        });
        repaired += 1;
      }
    }

    for (const localRow of local) {
      if (remoteIds.has(localRow.customerId) || localRow.bindingState === 'unbound') {
        continue;
      }

      await this.upsertMirror({
        customerId: localRow.customerId,
        displayName: localRow.displayName,
        cippTenantId: localRow.cippTenantId,
        sourceVersion: localRow.sourceVersion,
        lastObservedAt: nowIso(this.now),
        lastWebhookAt: localRow.lastWebhookAt ?? nowIso(this.now),
        bindingState: 'unbound',
      });
      repaired += 1;
    }

    return { repaired };
  }

  private async listWebhookEvents(limit: number): Promise<EventRecord[]> {
    const events: EventRecord[] = [];
    const entities = this.eventClient.listEntities<RawEventEntity>({
      queryOptions: {
        filter: `PartitionKey eq '${EVENT_PARTITION_KEY}' and status eq 'received'`,
      },
    });

    for await (const entity of entities) {
      events.push(mapEventEntity(entity));
      if (events.length >= limit) {
        break;
      }
    }

    return events;
  }

  private async applyQueuedEvent(
    event: CippWebhookEvent,
    observedAt: string,
  ): Promise<ProcessResult> {
    const existingEvent = await this.getEvent(event.eventId);
    if (!existingEvent) {
      return { accepted: false, reason: 'replay_conflict' };
    }
    if (existingEvent.status !== 'processing') {
      return {
        accepted: false,
        reason: existingEvent.status === 'replay_conflict' ? 'replay_conflict' : 'duplicate',
      };
    }

    const incomingVersion = event.sourceVersion ?? 0;
    const writeApplied = await this.upsertMirrorIfNewer({
      customerId: event.customerId,
      displayName: event.displayName,
      cippTenantId: event.cippTenantId,
      sourceVersion: incomingVersion,
      lastObservedAt: observedAt,
      lastWebhookAt: event.eventTime,
      bindingState: normalizeBindingState(event.eventType),
    });

    if (!writeApplied) {
      await this.updateEventStatus(event.eventId, {
        status: 'stale',
        processedAt: nowIso(this.now),
      });
      return { accepted: false, reason: 'stale' };
    }

    await this.updateEventStatus(event.eventId, {
      status: 'applied',
      processedAt: nowIso(this.now),
    });
    return { accepted: true };
  }

  private async getEvent(eventId: string): Promise<EventRecord | undefined> {
    try {
      const entity = await this.eventClient.getEntity<RawEventEntity>(EVENT_PARTITION_KEY, eventId);
      return mapEventEntity(entity);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private async upsertMirror(record: {
    customerId: string;
    displayName: string;
    cippTenantId: string;
    sourceVersion: number;
    lastObservedAt: string;
    lastWebhookAt: string;
    bindingState: CustomerMirrorRecord['bindingState'];
  }): Promise<void> {
    const entity: TableEntity<RawMirrorEntity> = {
      PartitionKey: MIRROR_PARTITION_KEY,
      RowKey: record.customerId,
      partitionKey: MIRROR_PARTITION_KEY,
      rowKey: record.customerId,
      customerId: record.customerId,
      displayName: record.displayName,
      cippTenantId: record.cippTenantId,
      sourceVersion: record.sourceVersion,
      lastObservedAt: record.lastObservedAt,
      lastWebhookAt: record.lastWebhookAt,
      bindingState: record.bindingState,
    };
    await this.mirrorClient.upsertEntity(entity, 'Replace');
  }

  private async upsertMirrorIfNewer(record: {
    customerId: string;
    displayName: string;
    cippTenantId: string;
    sourceVersion: number;
    lastObservedAt: string;
    lastWebhookAt: string;
    bindingState: CustomerMirrorRecord['bindingState'];
  }): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let existingEntity: RawMirrorEntity | undefined;
      try {
        existingEntity = await this.mirrorClient.getEntity<RawMirrorEntity>(
          MIRROR_PARTITION_KEY,
          record.customerId,
        );
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }

      const existingVersion = existingEntity ? asNumber(existingEntity.sourceVersion) : undefined;
      if (existingVersion !== undefined && record.sourceVersion < existingVersion) {
        return false;
      }

      const entity: TableEntity<RawMirrorEntity> = {
        PartitionKey: MIRROR_PARTITION_KEY,
        RowKey: record.customerId,
        partitionKey: MIRROR_PARTITION_KEY,
        rowKey: record.customerId,
        customerId: record.customerId,
        displayName: record.displayName,
        cippTenantId: record.cippTenantId,
        sourceVersion: record.sourceVersion,
        lastObservedAt: record.lastObservedAt,
        lastWebhookAt: record.lastWebhookAt,
        bindingState: record.bindingState,
      };

      if (!existingEntity) {
        try {
          await this.mirrorClient.createEntity(entity);
          return true;
        } catch (error) {
          if (!isConflictError(error)) {
            throw error;
          }
          continue;
        }
      }

      const etag = existingEntity.etag;
      if (!etag) {
        await this.upsertMirror(record);
        return true;
      }

      try {
        await this.mirrorClient.updateEntity(entity, 'Replace', { etag });
        return true;
      } catch (error) {
        if (isConflictError(error)) {
          continue;
        }
        throw error;
      }
    }

    return false;
  }

  private async updateEventStatus(
    eventId: string,
    updates: Pick<EventRecord, 'status' | 'processedAt'>,
  ): Promise<void> {
    await this.eventClient.updateEntity(
      {
        PartitionKey: EVENT_PARTITION_KEY,
        RowKey: eventId,
        status: updates.status,
        processedAt: updates.processedAt,
      } as TableEntity<RawEventEntity>,
      'Merge',
    );
  }

  private async claimEventForProcessing(event: EventRecord): Promise<boolean> {
    if (!event.etag) {
      return false;
    }
    try {
      await this.eventClient.updateEntity(
        {
          PartitionKey: EVENT_PARTITION_KEY,
          RowKey: event.eventId,
          status: 'processing',
        } as TableEntity<RawEventEntity>,
        'Merge',
        { etag: event.etag },
      );
      return true;
    } catch {
      return false;
    }
  }

  private buildEventEntity(params: {
    event: CippWebhookEvent;
    payloadHash: string;
    firstSeenAt: string;
    status: EventRecord['status'];
  }): TableEntity<RawEventEntity> {
    return {
      PartitionKey: EVENT_PARTITION_KEY,
      RowKey: params.event.eventId,
      partitionKey: EVENT_PARTITION_KEY,
      rowKey: params.event.eventId,
      customerId: params.event.customerId,
      eventType: params.event.eventType,
      eventId: params.event.eventId,
      payloadHash: params.payloadHash,
      sourceVersion: params.event.sourceVersion ?? 0,
      displayName: params.event.displayName,
      cippTenantId: params.event.cippTenantId,
      eventTime: params.event.eventTime,
      firstSeenAt: params.firstSeenAt,
      status: params.status,
    } as TableEntity<RawEventEntity>;
  }

  private tableCreation: Promise<void> | undefined;
  private async ensureTables(connectionString?: string): Promise<void> {
    if (this.tableCreation) {
      return this.tableCreation;
    }

    this.tableCreation = (async () => {
      const tableService = TableServiceClient.fromConnectionString(
        connectionString ??
          process.env.AZURE_WEBJOBS_STORAGE ??
          process.env.CIPP_WEBHOOK_STORAGE_CONNECTION_STRING ??
          process.env.CIPP_STORAGE_CONNECTION_STRING ??
          '',
      );
      try {
        await tableService.createTable(this.mirrorTableName);
      } catch (error) {
        if (!isConflictError(error) && !isNotFoundError(error)) {
          throw error;
        }
      }

      try {
        await tableService.createTable(this.eventTableName);
      } catch (error) {
        if (!isConflictError(error) && !isNotFoundError(error)) {
          throw error;
        }
      }
    })().catch((error) => {
      this.tableCreation = undefined;
      throw error;
    });

    return this.tableCreation;
  }
}

export function createCippSyncStore(env: NodeJS.ProcessEnv = process.env): CippSyncStore {
  const allowInMemoryFallback = env.CIPP_ALLOW_INMEMORY_FALLBACK === 'true';
  const storageConnectionString =
    env.CIPP_WEBHOOK_STORAGE_CONNECTION_STRING ??
    env.CIPP_STORAGE_CONNECTION_STRING ??
    env.AZURE_WEBJOBS_STORAGE ??
    env.AzureWebJobsStorage;

  if (!storageConnectionString) {
    return new InMemoryCippSyncStore();
  }

  try {
    return new DurableCippSyncStore({
      storageConnectionString,
      mirrorTableName: env.CIPP_WEBHOOK_MIRROR_TABLE ?? DEFAULT_MIRROR_TABLE,
      eventTableName: env.CIPP_WEBHOOK_EVENT_TABLE ?? DEFAULT_WEBHOOK_EVENT_TABLE,
    });
  } catch (error) {
    if (!allowInMemoryFallback) {
      throw error;
    }
    return new InMemoryCippSyncStore();
  }
}
