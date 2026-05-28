import {
  type AuditEntry,
  ExpiredRefreshTokenError,
  GenericProviderError,
  type Customer,
  NetworkTimeoutError,
  NotFoundError,
  QuotaExceededError,
  type ProviderError,
  type ProviderResult,
  type User,
  type IdentityProvider,
} from '@cipp-google/core';

interface DirectoryUser {
  id: string;
  primaryEmail: string;
  displayName?: string;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
  etag: string;
}

interface DirectoryRequestContext {
  customerId: string;
  key: string;
  method: 'listUsers' | 'getUser' | 'updateSuspension';
  domainWideDelegationEnabled: boolean;
}

export interface GoogleBindingRecord {
  customerId: string;
  refreshTokenSecretRef: string;
  adminEmail?: string;
  requiresReauth?: boolean;
}

export interface GoogleDirectoryService {
  listUsers(ctx: DirectoryRequestContext): Promise<readonly DirectoryUser[]>;
  getUser(ctx: DirectoryRequestContext): Promise<DirectoryUser | null>;
  updateUserSuspension(
    ctx: DirectoryRequestContext,
    suspended: boolean,
  ): Promise<DirectoryUser>;
}

export interface GoogleAuditEvent {
  customerId: string;
  customerName: string;
  method: 'listUsers' | 'getUser' | 'suspendUser' | 'resumeUser' | 'readUserSnapshot';
  key?: string;
  domainWideDelegationEnabled: boolean;
  timestamp: string;
}

export interface GoogleAdapterOptions {
  directory: GoogleDirectoryService;
  resolveBinding(customer: Customer): Promise<GoogleBindingRecord>;
  cacheTtlMs?: number;
  requestWindowMs?: number;
  customerRateLimitPer100s?: number;
  userRateLimitPer100s?: number;
  maxQuotaRetries?: number;
  random?: () => number;
  now?: () => number;
  setRequiresReauth?: (customer: Customer, reason: 'invalid_grant') => Promise<void> | void;
  enableDomainWideDelegation?: boolean;
  onAuditEvent?: (event: GoogleAuditEvent) => Promise<void> | void;
}

interface CacheEntry<T> {
  value: T;
  etag: string;
  expiresAtMs: number;
}

interface TokenBucketState {
  tokens: number;
  lastRefillAtMs: number;
}

interface ProviderResultFailure {
  ok: false;
  error: ProviderError;
}

interface ProviderResultSuccess<T> {
  ok: true;
  value: T;
}

interface QuotaBucketSpec {
  map: Map<string, TokenBucketState>;
  key: string;
  capacity: number;
}

const DEFAULT_CACHE_TTL_MS = 30_000;
const REQUEST_WINDOW_MS = 100_000;
const DEFAULT_CUSTOMER_LIMIT = 7_500;
const DEFAULT_USER_LIMIT = 2_400;
const DEFAULT_MAX_RETRIES = 4;

const isInvalidGrant = (error: {
  status?: number;
  statusCode?: number;
  message?: string;
  code?: string;
}): boolean => {
  const status = error.status ?? error.statusCode;
  const code = error.code?.toLowerCase();
  const message = (error.message ?? '').toLowerCase();

  return (
    status === 401 ||
    code === 'invalid_grant' ||
    message.includes('invalid_grant') ||
    message.includes('invalid grant')
  );
};

const isQuota = (error: { status?: number; message?: string; code?: string }): boolean => {
  const status = error.status;
  const code = error.code?.toLowerCase();
  const message = (error.message ?? '').toLowerCase();
  return status === 429 || status === 403 || code === 'rate_limit_exceeded' || message.includes('quota');
};

const isTimeout = (error: { status?: number; code?: string; message?: string }): boolean => {
  const status = error.status;
  const code = error.code?.toUpperCase();
  const message = (error.message ?? '').toLowerCase();
  return (
    status === 408 ||
    status === 504 ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    message.includes('timeout') ||
    message.includes('timed out')
  );
};

const isNotFound = (error: {
  status?: number;
  statusCode?: number;
  code?: string;
  message?: string;
}): boolean => {
  const status = error.status ?? error.statusCode;
  const code = error.code?.toLowerCase();
  const message = (error.message ?? '').toLowerCase();
  return status === 404 || code === 'not_found' || message.includes('not found');
};

const cloneUser = (user: User): User => ({
  ...user,
  m365: user.m365 ? { ...user.m365 } : undefined,
  google: user.google ? { ...user.google } : undefined,
});

const makeUser = (customer: Customer, raw: DirectoryUser): User => ({
  id: raw.id,
  customerId: customer.id,
  email: raw.primaryEmail,
  displayName: raw.displayName ?? raw.primaryEmail,
  suspended: raw.suspended,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
  google: {
    kind: 'google',
    customerId: customer.id,
    userId: raw.id,
    email: raw.primaryEmail,
  },
});

const nowIso = (ts: number): string => new Date(ts).toISOString();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class GoogleAdapter implements IdentityProvider {
  private readonly directory: GoogleDirectoryService;
  private readonly resolveBinding: (customer: Customer) => Promise<GoogleBindingRecord>;
  private readonly cacheTtlMs: number;
  private readonly requestWindowMs: number;
  private readonly customerRateLimitPer100s: number;
  private readonly userRateLimitPer100s: number;
  private readonly maxQuotaRetries: number;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly setRequiresReauth?: (customer: Customer, reason: 'invalid_grant') => Promise<void> | void;
  private readonly enableDomainWideDelegation: boolean;
  private readonly onAuditEvent?: (event: GoogleAuditEvent) => Promise<void> | void;

  private readonly customerBuckets = new Map<string, TokenBucketState>();
  private readonly userBuckets = new Map<string, TokenBucketState>();
  private readonly listCache = new Map<string, CacheEntry<readonly User[]>>();
  private readonly userCache = new Map<string, CacheEntry<User>>();
  private readonly snapshots = new Map<string, Map<string, AuditEntry>>();

  public constructor(options: GoogleAdapterOptions) {
    this.directory = options.directory;
    this.resolveBinding = options.resolveBinding;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.requestWindowMs = options.requestWindowMs ?? REQUEST_WINDOW_MS;
    this.customerRateLimitPer100s = options.customerRateLimitPer100s ?? DEFAULT_CUSTOMER_LIMIT;
    this.userRateLimitPer100s = options.userRateLimitPer100s ?? DEFAULT_USER_LIMIT;
    this.maxQuotaRetries = options.maxQuotaRetries ?? DEFAULT_MAX_RETRIES;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
    this.setRequiresReauth = options.setRequiresReauth;
    this.enableDomainWideDelegation = options.enableDomainWideDelegation ?? false;
    this.onAuditEvent = options.onAuditEvent;
  }

  public async listUsers(customer: Customer): Promise<ProviderResult<readonly User[]>> {
    await this.recordAuditEvent({ method: 'listUsers', customer, key: 'list' });

    const cacheKey = `${customer.id}::list`;
    const cached = this.getCached(this.listCache.get(cacheKey));
    if (cached) {
      return { ok: true, value: cached.map(cloneUser) };
    }

    const binding = await this.loadBinding(customer);
    if (!binding.ok) {
      return binding;
    }

    const quotaResult = await this.withQuotaRetry(
      () =>
        this.tryConsumeBuckets([
          {
            map: this.customerBuckets,
            key: `${customer.id}::customer`,
            capacity: this.customerRateLimitPer100s,
          },
        ]),
      { customer, key: 'list', method: 'listUsers' },
    );
    if (!quotaResult.ok) {
      return quotaResult;
    }

    try {
      const rawUsers = await this.directory.listUsers({
        customerId: customer.id,
        key: 'list',
        method: 'listUsers',
        domainWideDelegationEnabled: this.enableDomainWideDelegation,
      });
      const users = rawUsers.map((user) => makeUser(customer, user));
      this.listCache.set(cacheKey, {
        value: users,
        etag: this.hashUsers(rawUsers),
        expiresAtMs: this.now() + this.cacheTtlMs,
      });
      return { ok: true, value: users.map(cloneUser) };
    } catch (error) {
      return { ok: false, error: await this.toProviderError(customer, error) };
    }
  }

  public async getUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    await this.recordAuditEvent({ method: 'getUser', customer, key });

    const cacheKey = `${customer.id}::user::${key}`;
    const cached = this.getCached(this.userCache.get(cacheKey));
    if (cached) {
      return { ok: true, value: cloneUser(cached) };
    }

    const binding = await this.loadBinding(customer);
    if (!binding.ok) {
      return binding;
    }

    const quotaResult = await this.withQuotaRetry(
      () =>
        this.tryConsumeBuckets([
          {
            map: this.userBuckets,
            key: `${customer.id}::user::${key}`,
            capacity: this.userRateLimitPer100s,
          },
          {
            map: this.customerBuckets,
            key: `${customer.id}::customer`,
            capacity: this.customerRateLimitPer100s,
          },
        ]),
      { customer, key, method: 'getUser' },
    );
    if (!quotaResult.ok) {
      return quotaResult;
    }

    try {
      const rawUser = await this.directory.getUser({
        customerId: customer.id,
        key,
        method: 'getUser',
        domainWideDelegationEnabled: this.enableDomainWideDelegation,
      });
      if (!rawUser) {
        return { ok: false, error: new NotFoundError() };
      }

      const mapped = makeUser(customer, rawUser);
      this.userCache.set(cacheKey, {
        value: mapped,
        etag: rawUser.etag,
        expiresAtMs: this.now() + this.cacheTtlMs,
      });
      this.upsertSnapshot(customer.id, key, {
        customerId: customer.id,
        key,
        action: 'read',
        before: cloneUser(mapped),
        after: cloneUser(mapped),
        timestamp: nowIso(this.now()),
      });

      return { ok: true, value: cloneUser(mapped) };
    } catch (error) {
      return { ok: false, error: await this.toProviderError(customer, error) };
    }
  }

  public async suspendUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    return this.setSuspension(customer, key, true, 'suspend');
  }

  public async resumeUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    return this.setSuspension(customer, key, false, 'resume');
  }

  public async readUserSnapshot(
    customer: Customer,
    key: string,
  ): Promise<ProviderResult<AuditEntry>> {
    await this.recordAuditEvent({ method: 'readUserSnapshot', customer, key });

    const latest = this.snapshotFor(customer.id, key);
    if (latest) {
      return { ok: true, value: this.cloneAuditEntry(latest) };
    }

    const user = await this.getUser(customer, key);
    if (!user.ok) {
      return { ok: false, error: user.error };
    }

    const snapshot: AuditEntry = {
      customerId: customer.id,
      key,
      action: 'read',
      before: cloneUser(user.value),
      after: cloneUser(user.value),
      timestamp: nowIso(this.now()),
    };
    this.upsertSnapshot(customer.id, key, snapshot);
    return { ok: true, value: snapshot };
  }

  private async setSuspension(
    customer: Customer,
    key: string,
    suspended: boolean,
    action: 'suspend' | 'resume',
  ): Promise<ProviderResult<User>> {
    await this.recordAuditEvent({
      method: action === 'suspend' ? 'suspendUser' : 'resumeUser',
      customer,
      key,
    });

    const binding = await this.loadBinding(customer);
    if (!binding.ok) {
      return binding;
    }

    const quotaResult = await this.withQuotaRetry(
      () =>
        this.tryConsumeBuckets([
          {
            map: this.userBuckets,
            key: `${customer.id}::user::${key}`,
            capacity: this.userRateLimitPer100s,
          },
          {
            map: this.customerBuckets,
            key: `${customer.id}::customer`,
            capacity: this.customerRateLimitPer100s,
          },
        ]),
      { customer, key, method: action === 'suspend' ? 'suspendUser' : 'resumeUser' },
    );
    if (!quotaResult.ok) {
      return quotaResult;
    }

    const pre = await this.getUser(customer, key);
    if (!pre.ok) {
      return pre;
    }

    try {
      const raw = await this.directory.updateUserSuspension(
        {
          customerId: customer.id,
          key,
          method: 'updateSuspension',
          domainWideDelegationEnabled: this.enableDomainWideDelegation,
        },
        suspended,
      );
      const after = makeUser(customer, raw);
      const snapshot: AuditEntry = {
        customerId: customer.id,
        key,
        action,
        before: cloneUser(pre.value),
        after: cloneUser(after),
        timestamp: nowIso(this.now()),
      };
      this.upsertSnapshot(customer.id, key, snapshot);
      this.userCache.delete(`${customer.id}::user::${key}`);
      this.listCache.delete(`${customer.id}::list`);
      return { ok: true, value: cloneUser(after) };
    } catch (error) {
      return { ok: false, error: await this.toProviderError(customer, error) };
    }
  }

  private async loadBinding(
    customer: Customer,
  ): Promise<ProviderResultSuccess<GoogleBindingRecord> | ProviderResultFailure> {
    let binding: GoogleBindingRecord;
    try {
      binding = await this.resolveBinding(customer);
    } catch {
      return { ok: false, error: new GenericProviderError('failed_to_resolve_binding') };
    }

    if (binding.requiresReauth || !binding.refreshTokenSecretRef) {
      return {
        ok: false,
        error: new ExpiredRefreshTokenError(
          binding.requiresReauth ? 'binding_requires_reauth' : 'missing_refresh_token_reference',
        ),
      };
    }

    return { ok: true, value: binding };
  }

  private getCached<T>(entry?: CacheEntry<T>): T | undefined {
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAtMs <= this.now()) {
      return undefined;
    }
    return entry.value;
  }

  private hashUsers(users: readonly DirectoryUser[]): string {
    return users
      .map((user) => `${user.id}:${user.etag}`)
      .sort()
      .join('|');
  }

  private cloneAuditEntry(snapshot: AuditEntry): AuditEntry {
    return {
      ...snapshot,
      before: cloneUser(snapshot.before),
      after: cloneUser(snapshot.after),
    };
  }

  private upsertSnapshot(customerId: string, key: string, snapshot: AuditEntry): void {
    let customerSnapshots = this.snapshots.get(customerId);
    if (!customerSnapshots) {
      customerSnapshots = new Map<string, AuditEntry>();
      this.snapshots.set(customerId, customerSnapshots);
    }
    customerSnapshots.set(key, this.cloneAuditEntry(snapshot));
  }

  private snapshotFor(customerId: string, key: string): AuditEntry | undefined {
    return this.snapshots.get(customerId)?.get(key);
  }

  private async withQuotaRetry(
    attempt: () => boolean,
    context: {
      customer: Customer;
      key: string;
      method: 'listUsers' | 'getUser' | 'suspendUser' | 'resumeUser';
    },
  ): Promise<ProviderResultSuccess<null> | ProviderResultFailure> {
    let retries = 0;
    while (retries <= this.maxQuotaRetries) {
      if (attempt()) {
        return { ok: true, value: null };
      }
      if (retries >= this.maxQuotaRetries) {
        return {
          ok: false,
          error: new QuotaExceededError(
            `quota_retries_exhausted for ${context.method} on ${context.customer.id}:${context.key}`,
          ),
        };
      }

      const jitter = this.random();
      const waitMs = Math.min(1_200, 50 * 2 ** retries + Math.floor(jitter * 40));
      await sleep(waitMs);
      retries += 1;
    }

    return {
      ok: false,
      error: new QuotaExceededError(
        `quota_retries_exhausted for ${context.method} on ${context.customer.id}:${context.key}`,
      ),
    };
  }

  private tryConsumeBuckets(entries: readonly QuotaBucketSpec[]): boolean {
    const nowMs = this.now();
    const projections = entries.map((entry) => {
      const current = entry.map.get(entry.key);
      if (!current) {
        return {
          entry,
          next: {
            tokens: entry.capacity - 1,
            lastRefillAtMs: nowMs,
          },
        };
      }

      const elapsedMs = Math.max(0, nowMs - current.lastRefillAtMs);
      const refillRate = entry.capacity / this.requestWindowMs;
      const replenished = Math.min(entry.capacity, current.tokens + elapsedMs * refillRate);
      return {
        entry,
        next: {
          ...current,
          tokens: replenished - 1,
          lastRefillAtMs: nowMs,
        },
      };
    });

    if (projections.some(({ next }) => next.tokens < 0)) {
      return false;
    }

    projections.forEach(({ entry, next }) => {
      entry.map.set(entry.key, next);
    });

    return true;
  }

  private async toProviderError(customer: Customer, raw: unknown): Promise<ProviderError> {
    const normalized = raw as {
      status?: number;
      statusCode?: number;
      message?: string;
      code?: string;
    };

    if (isInvalidGrant(normalized)) {
      await this.setRequiresReauthSafely(customer, 'invalid_grant');
      return new ExpiredRefreshTokenError(normalized.message ?? 'invalid_grant');
    }
    if (isNotFound(normalized)) {
      return new NotFoundError(normalized.message ?? 'not_found');
    }
    if (isQuota(normalized)) {
      return new QuotaExceededError(normalized.message ?? 'quota_exceeded');
    }
    if (isTimeout(normalized)) {
      return new NetworkTimeoutError(normalized.message ?? 'network_timeout');
    }

    return new GenericProviderError(normalized.message ?? normalized.code ?? 'provider_error');
  }

  private async setRequiresReauthSafely(
    customer: Customer,
    reason: 'invalid_grant',
  ): Promise<void> {
    if (!this.setRequiresReauth) {
      return;
    }

    try {
      await this.setRequiresReauth(customer, reason);
    } catch {
      // Binding persistence is non-fatal to the user path; failures are best-effort.
      // If reauth marking can’t be written, callers still need to know their token is invalid.
    }
  }

  private async recordAuditEvent(params: {
    method: GoogleAuditEvent['method'];
    customer: Customer;
    key?: string;
  }): Promise<void> {
    if (!this.onAuditEvent) {
      return;
    }

    try {
      await this.onAuditEvent({
        customerId: params.customer.id,
        customerName: params.customer.name,
        method: params.method,
        key: params.key,
        domainWideDelegationEnabled: this.enableDomainWideDelegation,
        timestamp: nowIso(this.now()),
      });
    } catch {
      // Audit hooks are intentionally non-fatal; they support tracing and
      // policy reporting even when the write path fails.
    }
  }
}

export class InMemoryGoogleDirectory implements GoogleDirectoryService {
  private readonly users = new Map<string, Map<string, DirectoryUser>>();

  public constructor(seedUsers: readonly User[] = []) {
    seedUsers.forEach((user) => {
      this.seed(user);
    });
  }

  public async listUsers(ctx: DirectoryRequestContext): Promise<readonly DirectoryUser[]> {
    return [...this.getUserSet(ctx.customerId).values()].map((user) => ({ ...user }));
  }

  public async getUser(ctx: DirectoryRequestContext): Promise<DirectoryUser | null> {
    return this.getUserSet(ctx.customerId).get(ctx.key) ?? null;
  }

  public async updateUserSuspension(
    ctx: DirectoryRequestContext,
    suspended: boolean,
  ): Promise<DirectoryUser> {
    const current = this.getUserSet(ctx.customerId).get(ctx.key);
    if (!current) {
      const error = new Error('user not found');
      (error as Error & { status: number }).status = 404;
      throw error;
    }

    const updated = {
      ...current,
      suspended,
      updatedAt: nowIso(Date.now()),
      etag: `etag-${ctx.customerId}-${ctx.key}-${Date.now()}`,
    };
    this.getUserSet(ctx.customerId).set(ctx.key, updated);
    return { ...updated };
  }

  private seed(user: User): void {
    const customerUsers = this.getUserSet(user.customerId);
    customerUsers.set(user.id, {
      id: user.id,
      primaryEmail: user.email,
      displayName: user.displayName,
      suspended: user.suspended,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      etag: `etag-${user.customerId}-${user.id}-${Date.now()}`,
    });
  }

  private getUserSet(customerId: string): Map<string, DirectoryUser> {
    let userSet = this.users.get(customerId);
    if (!userSet) {
      userSet = new Map<string, DirectoryUser>();
      this.users.set(customerId, userSet);
    }
    return userSet;
  }
}
