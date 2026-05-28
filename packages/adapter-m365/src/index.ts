import {
  type IdentityProvider,
  type Customer,
  type ProviderResult,
  type User,
  type AuditEntry,
  ProviderError,
  GenericProviderError,
  QuotaExceededError,
  ExpiredRefreshTokenError,
  NetworkTimeoutError,
  NotFoundError,
} from '@cipp-google/core';

const CLOCK = () => new Date().toISOString();

interface FetchClient {
  (input: string, init?: RequestInit): Promise<Response>;
}

interface GraphListUsersResponse {
  value: GraphUserResponse[];
}

interface GraphUserResponse {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  accountEnabled?: boolean;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  '@odata.etag'?: string;
  signInActivity?: {
    lastSignInDateTime?: string;
  };
}

type GraphFailureResponse = {
  ok: false;
  status: number;
  error?: ProviderError;
  errorMessage?: string;
  etag?: string;
};

interface KeyVaultSecret {
  value: string;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface ETagCacheEntry {
  etag: string;
  user: User;
  fetchedAtMs: number;
}

interface CachedSecret {
  value: string;
  expiresAtMs: number;
}

const DEFAULT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const DEFAULT_KEYVAULT_API_VERSION = '7.4';

const GRAPH_AUDIENCE = 'https://graph.microsoft.com/.default';
const KEYVAULT_TOKEN_RESOURCE = 'https://vault.azure.net';
const MANAGED_IDENTITY_TOKEN_ENDPOINT = 'http://169.254.169.254/metadata/identity/oauth2/token';
const MANAGED_IDENTITY_METADATA_HEADER = 'Metadata';
const OAUTH_TOKEN_ENDPOINT = 'https://login.microsoftonline.com';

export class AuthExpiredError extends ExpiredRefreshTokenError {}
export class ThrottledError extends QuotaExceededError {}
export class ForbiddenError extends ProviderError {
  constructor(message = 'forbidden') {
    super({
      code: 'generic',
      message,
      statusCode: 403,
      retryable: false,
    });
  }
}

export class NetworkError extends NetworkTimeoutError {}

export interface M365AdapterOptions {
  keyVaultBaseUrl?: string;
  keyVaultApiVersion?: string;
  graphBaseUrl?: string;
  tenantIdSecretNameTemplate?: string;
  graphClientIdSecretName?: string;
  graphClientSecretSecretName?: string;
  graphTenantSecretName?: string;
  managedIdentityResource?: string;
  managedIdentityClientId?: string;
  fetch?: FetchClient;
  clock?: () => number;
  etagTtlMs?: number;
  maxThrottleRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  tenantIdProvider?: (customer: Customer) => Promise<string>;
  tokenProvider?: (customer: Customer, tenantId: string) => Promise<string>;
}

export interface TenantContext {
  tenantId: string;
  graphToken: string;
}

const encodePathSegment = encodeURIComponent;

export class M365Adapter implements IdentityProvider {
  private readonly fetchClient: FetchClient;
  private readonly keyVaultBaseUrl?: string;
  private readonly keyVaultApiVersion: string;
  private readonly graphBaseUrl: string;
  private readonly tenantIdSecretNameTemplate: string;
  private readonly graphClientIdSecretName: string;
  private readonly graphClientSecretSecretName: string;
  private readonly graphTenantSecretName: string;
  private readonly managedIdentityResource: string;
  private readonly managedIdentityClientId?: string;
  private readonly clock: () => number;
  private readonly etagTtlMs: number;
  private readonly maxThrottleRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly tenantIdProvider?: (customer: Customer) => Promise<string>;
  private readonly tokenProvider?: (customer: Customer, tenantId: string) => Promise<string>;

  private readonly etagCache = new Map<string, ETagCacheEntry>();
  private readonly snapshots = new Map<string, Map<string, AuditEntry>>();
  private readonly kvSecretCache = new Map<string, CachedSecret>();
  private readonly graphTokenCache = new Map<string, CachedSecret>();

  constructor(options: M365AdapterOptions = {}) {
    this.fetchClient = options.fetch ?? globalThis.fetch;
    this.keyVaultBaseUrl = options.keyVaultBaseUrl;
    this.keyVaultApiVersion = options.keyVaultApiVersion ?? DEFAULT_KEYVAULT_API_VERSION;
    this.graphBaseUrl = options.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL;
    this.tenantIdSecretNameTemplate = options.tenantIdSecretNameTemplate ?? 'gdap/{customerId}/tenant-id';
    this.graphClientIdSecretName = options.graphClientIdSecretName ?? 'gdap/graph/client-id';
    this.graphClientSecretSecretName = options.graphClientSecretSecretName ?? 'gdap/graph/client-secret';
    this.graphTenantSecretName = options.graphTenantSecretName ?? 'gdap/graph/tenant-id';
    this.managedIdentityResource = options.managedIdentityResource ?? KEYVAULT_TOKEN_RESOURCE;
    this.managedIdentityClientId = options.managedIdentityClientId;
    this.clock = options.clock ?? Date.now;
    this.etagTtlMs = options.etagTtlMs ?? 30_000;
    this.maxThrottleRetries = options.maxThrottleRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 8_000;
    this.tenantIdProvider = options.tenantIdProvider;
    this.tokenProvider = options.tokenProvider;
  }

  public async listUsers(customer: Customer): Promise<ProviderResult<readonly User[]>> {
    const contextResult = await this.getTenantContext(customer);
    if (!contextResult.ok) {
      return { ok: false, error: contextResult.error };
    }

    const { tenantId, graphToken } = contextResult.value;
    const response = await this.requestWithRetry(() =>
      this.graphGet<GraphListUsersResponse>(
        `${this.graphBaseUrl}/users?$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastModifiedDateTime,signInActivity`,
        graphToken,
        undefined,
      ),
    );

    if (!response.ok) {
      const failure = response as GraphFailureResponse;
      return this.handleFailure(response.status, failure.error?.message ?? failure.errorMessage);
    }

    const users = response.value.value.map((user) =>
      this.mapGraphUserToUser(customer, tenantId, user),
    );

    return { ok: true, value: users };
  }

  public async getUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    const contextResult = await this.getTenantContext(customer);
    if (!contextResult.ok) {
      return { ok: false, error: contextResult.error };
    }

    const { tenantId, graphToken } = contextResult.value;
    const cacheKey = this.makeCacheKey(customer.id, key);
    const cached = this.getCachedUser(cacheKey);
    const headers = cached ? { 'If-None-Match': cached.etag } : undefined;

    const response = await this.requestWithRetry(() =>
      this.graphGet<GraphUserResponse>(
        `${this.graphBaseUrl}/users/${encodePathSegment(key)}?$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastModifiedDateTime,signInActivity`,
        graphToken,
        headers,
      ),
    );

    if (response.status === 304 && cached) {
      return { ok: true, value: this.cloneUser(cached.user) };
    }

    if (!response.ok) {
      const failure = response as GraphFailureResponse;
      return this.handleFailure(response.status, failure.error?.message ?? failure.errorMessage);
    }

    const user = this.mapGraphUserToUser(customer, tenantId, response.value);

    const etag = response.value['@odata.etag'] ?? response.etag;
    if (etag) {
      this.setCachedUser(cacheKey, {
        etag,
        user,
        fetchedAtMs: this.clock(),
      });
    }

    return { ok: true, value: user };
  }

  public async suspendUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    const contextResult = await this.getTenantContext(customer);
    if (!contextResult.ok) {
      return { ok: false, error: contextResult.error };
    }

    const beforeResult = await this.getUser(customer, key);
    if (!beforeResult.ok) {
      return beforeResult;
    }

    const response = await this.requestWithRetry(() =>
      this.graphPatch(`${this.graphBaseUrl}/users/${encodePathSegment(key)}`, contextResult.value.graphToken, {
        accountEnabled: false,
      }),
    );

    if (!response.ok) {
      return { ok: false, error: response.error };
    }

    const after = {
      ...beforeResult.value,
      suspended: true,
      updatedAt: CLOCK(),
    };
    const snapshot: AuditEntry = {
      customerId: customer.id,
      key,
      action: 'suspend',
      before: this.cloneUser(beforeResult.value),
      after: this.cloneUser(after),
      timestamp: CLOCK(),
    };
    this.upsertSnapshot(customer.id, key, snapshot);

    this.setCachedUser(this.makeCacheKey(customer.id, key), {
      etag: 'W/"' + this.clock() + '"',
      user: after,
      fetchedAtMs: this.clock(),
    });

    return { ok: true, value: after };
  }

  public async resumeUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    const contextResult = await this.getTenantContext(customer);
    if (!contextResult.ok) {
      return { ok: false, error: contextResult.error };
    }

    const beforeResult = await this.getUser(customer, key);
    if (!beforeResult.ok) {
      return beforeResult;
    }

    const response = await this.requestWithRetry(() =>
      this.graphPatch(`${this.graphBaseUrl}/users/${encodePathSegment(key)}`, contextResult.value.graphToken, {
        accountEnabled: true,
      }),
    );

    if (!response.ok) {
      return { ok: false, error: response.error };
    }

    const after = {
      ...beforeResult.value,
      suspended: false,
      updatedAt: CLOCK(),
    };
    const snapshot: AuditEntry = {
      customerId: customer.id,
      key,
      action: 'resume',
      before: this.cloneUser(beforeResult.value),
      after: this.cloneUser(after),
      timestamp: CLOCK(),
    };
    this.upsertSnapshot(customer.id, key, snapshot);

    this.setCachedUser(this.makeCacheKey(customer.id, key), {
      etag: 'W/"' + this.clock() + '"',
      user: after,
      fetchedAtMs: this.clock(),
    });

    return { ok: true, value: after };
  }

  public async readUserSnapshot(
    customer: Customer,
    key: string,
  ): Promise<ProviderResult<AuditEntry>> {
    const cached = this.snapshotFor(customer.id, key);
    if (cached) {
      return { ok: true, value: this.cloneAuditEntry(cached) };
    }

    const snapshotUserResult = await this.getUser(customer, key);
    if (!snapshotUserResult.ok) {
      return { ok: false, error: snapshotUserResult.error };
    }

    const snapshot: AuditEntry = {
      customerId: customer.id,
      key,
      action: 'read',
      before: this.cloneUser(snapshotUserResult.value),
      after: this.cloneUser(snapshotUserResult.value),
      timestamp: CLOCK(),
    };
    this.upsertSnapshot(customer.id, key, snapshot);

    return { ok: true, value: snapshot };
  }

  private async getTenantContext(customer: Customer): Promise<ProviderResult<TenantContext>> {
    const tenantId = await this.getCustomerTenantId(customer);
    if (!tenantId) {
      return {
        ok: false,
        error: new GenericProviderError(
          `Unable to resolve tenantId for customer ${customer.id}. Configure KEY_VAULT_URI and tenant secret mapping.`,
        ),
      };
    }

    const graphTokenResult = await this.getGraphAccessToken(customer, tenantId);
    if (!graphTokenResult.ok) {
      return { ok: false, error: graphTokenResult.error };
    }

    return { ok: true, value: { tenantId, graphToken: graphTokenResult.value } };
  }

  private async getCustomerTenantId(customer: Customer): Promise<string | null> {
    if (this.tenantIdProvider) {
      return this.tenantIdProvider(customer);
    }

    const secretName = this.tenantIdSecretNameTemplate.replace('{customerId}', customer.id);
    const tenantId = await this.getKeyVaultSecret(secretName);
    return tenantId ?? null;
  }

  private async getGraphAccessToken(
    customer: Customer,
    tenantId: string,
  ): Promise<ProviderResult<string>> {
    if (this.tokenProvider) {
      try {
        const token = await this.tokenProvider(customer, tenantId);
        return { ok: true, value: token };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'token acquisition failed';
        return { ok: false, error: new GenericProviderError(message) };
      }
    }

    const cached = this.graphTokenCache.get(tenantId);
    if (cached && cached.expiresAtMs > this.clock()) {
      return { ok: true, value: cached.value };
    }

    const graphClientId = await this.getKeyVaultSecret(this.graphClientIdSecretName);
    const graphClientSecret = await this.getKeyVaultSecret(this.graphClientSecretSecretName);

    if (!graphClientId || !graphClientSecret) {
      return {
        ok: false,
        error: new GenericProviderError(
          'Missing Graph application credentials in Key Vault: graphClientId, graphClientSecret',
        ),
      };
    }

    const tokenResponse = await this.graphFetchToken(
      tenantId,
      graphClientId,
      graphClientSecret,
      GRAPH_AUDIENCE,
    );

    if (!tokenResponse.ok) {
      return { ok: false, error: tokenResponse.error };
    }

    const accessToken = tokenResponse.value;
    const expiresInMs = tokenResponse.expiresInMs ?? 60 * 60 * 1000;
    this.graphTokenCache.set(tenantId, {
      value: accessToken,
      expiresAtMs: this.clock() + Math.max(60_000, expiresInMs - 60_000),
    });

    return { ok: true, value: accessToken };
  }

  private async getKeyVaultSecret(secretName: string): Promise<string | null> {
    if (!this.keyVaultBaseUrl) {
      return null;
    }

    const cache = this.kvSecretCache.get(secretName);
    if (cache && cache.expiresAtMs > this.clock()) {
      return cache.value;
    }

    const tokenResult = await this.getManagedIdentityToken(this.managedIdentityResource, this.managedIdentityClientId);
    if (!tokenResult.ok) {
      return null;
    }

    const url = `${this.keyVaultBaseUrl}/secrets/${encodePathSegment(secretName)}?api-version=${encodeURIComponent(
      this.keyVaultApiVersion,
    )}`;
    let response: Response;
    try {
      response = await this.fetchClient(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenResult.value}`,
        },
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    try {
      const payload = (await response.json()) as KeyVaultSecret;
      const value = typeof payload.value === 'string' ? payload.value : null;
      if (typeof value === 'string') {
        this.kvSecretCache.set(secretName, {
          value,
          expiresAtMs: this.clock() + 5 * 60 * 1000,
        });
      }
      return value;
    } catch {
      return null;
    }
  }

  private async getManagedIdentityToken(
    resource: string,
    clientId?: string,
  ): Promise<ProviderResult<string>> {
    const tokenCacheKey = `mi:${resource}:${clientId ?? 'system'}`;
    const cached = this.kvSecretCache.get(tokenCacheKey);
    if (cached && cached.expiresAtMs > this.clock()) {
      return { ok: true, value: cached.value };
    }

    const query = new URLSearchParams({
      'api-version': '2019-08-01',
      resource,
    });

    if (clientId) {
      query.set('client_id', clientId);
    }

    let response: Response;
    try {
      response = await this.fetchClient(`${MANAGED_IDENTITY_TOKEN_ENDPOINT}?${query.toString()}`, {
        method: 'GET',
        headers: {
          [MANAGED_IDENTITY_METADATA_HEADER]: 'true',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'managed-identity request failed';
      return { ok: false, error: new GenericProviderError(message) };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: new GenericProviderError(`managed identity token request failed: ${response.status} ${response.statusText}`),
      };
    }

    const payload = (await response.json()) as TokenResponse;
    if (!payload.access_token) {
      return { ok: false, error: new GenericProviderError('managed identity response missing access_token') };
    }

    this.kvSecretCache.set(tokenCacheKey, {
      value: payload.access_token,
      expiresAtMs: this.clock() + (payload.expires_in ? payload.expires_in * 1000 : 3000_000),
    });

    return { ok: true, value: payload.access_token };
  }

  private async graphFetchToken(
    tenantId: string,
    clientId: string,
    clientSecret: string,
    scope: string,
  ): Promise<
    | { ok: true; value: string; expiresInMs: number | null }
    | { ok: false; error: ProviderError }
  > {
    const url = `${OAUTH_TOKEN_ENDPOINT}/${encodePathSegment(tenantId)}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      grant_type: 'client_credentials',
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    try {
      const response = await this.fetchClient(url, {
        method: 'POST',
        headers,
        body: form.toString(),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: new GenericProviderError(`graph token request failed: ${response.status} ${response.statusText}`),
        };
      }

      const payload = (await response.json()) as TokenResponse;
      if (!payload.access_token) {
        return { ok: false, error: new GenericProviderError('graph token response missing access_token') };
      }

      return {
        ok: true,
        value: payload.access_token,
        expiresInMs: payload.expires_in ? payload.expires_in * 1000 : null,
      };
    } catch (error) {
      return {
        ok: false,
        error: new NetworkError(error instanceof Error ? error.message : 'graph token request failed'),
      };
    }
  }

  private async graphGet<T>(url: string, token: string, headers?: Record<string, string>): Promise<
    { ok: true; value: T; etag?: string; status: number } | { ok: false; status: number; errorMessage?: string; etag?: string }
  > {
    let response: Response;
    try {
      response = await this.fetchClient(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(headers ? headers : {}),
        },
      });
    } catch (error) {
      return {
        ok: false,
        status: 0,
        errorMessage: error instanceof Error ? error.message : 'graph request failed',
      };
    }

    if (response.status === 204) {
      return { ok: false, status: response.status, errorMessage: 'No content', etag: response.headers.get('etag') ?? undefined };
    }

    if (response.status === 304) {
      return {
        ok: true,
        value: {} as T,
        etag: response.headers.get('etag') ?? undefined,
        status: response.status,
      };
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        errorMessage: error instanceof Error ? error.message : 'graph response JSON parse failed',
      };
    }

    return response.ok
      ? {
          ok: true,
          value: raw as T,
          etag: response.headers.get('etag') ?? undefined,
          status: response.status,
        }
      : {
          ok: false,
          status: response.status,
          errorMessage: this.extractErrorMessage(raw),
          etag: response.headers.get('etag') ?? undefined,
        };
  }

  private async graphPatch(url: string, token: string, body: Record<string, unknown>): Promise<
    { ok: true; status: number } | { ok: false; status: number; error: ProviderError }
  > {
    try {
      const response = await this.fetchClient(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.status === 204 || response.status === 200) {
        return { ok: true, status: response.status };
      }

      if (!response.ok) {
        const raw = await this.safeParseJson(response);
        return {
          ok: false,
          status: response.status,
          error: this.handleFailure(response.status, this.extractErrorMessage(raw)).error,
        };
      }

      return { ok: false, status: response.status, error: new GenericProviderError('unexpected graph patch response') };
    } catch (error) {
      return { ok: false, status: 0, error: new NetworkError(error instanceof Error ? error.message : 'patch failed') };
    }
  }

  private async requestWithRetry<T extends {
    ok: boolean;
    status: number;
  }>(
    request: () => Promise<
      | T
      | { ok: false; status: number; error?: ProviderError; etag?: string; errorMessage?: string }
    >,
  ): Promise<
    | T
    | {
        ok: false;
        error: ProviderError;
        status: number;
      }
  > {
    for (let attempt = 0; ; attempt += 1) {
      const result = await request();
      if (result.ok) {
        return result;
      }

      if (result.status !== 429 || attempt >= this.maxThrottleRetries) {
        const failure = result as GraphFailureResponse;
        if (failure.error) {
          return {
            ok: false,
            status: failure.status,
            error: failure.error,
          };
        }

        return {
          ok: false,
          status: result.status,
          error: this.handleFailure(result.status, failure.errorMessage).error,
        };
      }

      const delayMs = this.calcRetryDelay(attempt);
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  private makeCacheKey(customerId: string, key: string): string {
    return `${customerId}::${key}`;
  }

  private getCachedUser(cacheKey: string): ETagCacheEntry | null {
    const entry = this.etagCache.get(cacheKey);
    if (!entry) {
      return null;
    }

    if (this.clock() - entry.fetchedAtMs >= this.etagTtlMs) {
      this.etagCache.delete(cacheKey);
      return null;
    }

    return entry;
  }

  private setCachedUser(cacheKey: string, entry: ETagCacheEntry): void {
    this.etagCache.set(cacheKey, entry);
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

  private calcRetryDelay(attempt: number): number {
    const exponential = Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * 2 ** attempt);
    const jitter = Math.floor(Math.random() * 500);
    return exponential + jitter;
  }

  private handleFailure(status: number, message?: string): { ok: false; error: ProviderError } {
    if (status === 401) {
      return { ok: false, error: new AuthExpiredError(message) };
    }

    if (status === 403) {
      return { ok: false, error: new ForbiddenError(message) };
    }

    if (status === 404) {
      return { ok: false, error: new NotFoundError(message) };
    }

    if (status === 429) {
      return { ok: false, error: new ThrottledError(message) };
    }

    if (status === 0 || status >= 500) {
      return { ok: false, error: new NetworkError(message) };
    }

    return { ok: false, error: new GenericProviderError(message) };
  }

  private mapGraphUserToUser(
    customer: Customer,
    tenantId: string,
    raw: GraphUserResponse,
  ): User {
    return {
      id: raw.id,
      customerId: customer.id,
      email: raw.userPrincipalName ?? raw.id,
      displayName: raw.displayName ?? raw.userPrincipalName ?? 'Unknown',
      suspended: raw.accountEnabled === false,
      createdAt: raw.createdDateTime ?? CLOCK(),
      updatedAt: raw.lastModifiedDateTime ?? raw.createdDateTime ?? CLOCK(),
      m365: {
        kind: 'm365',
        tenantId,
        userId: raw.id,
        upn: raw.userPrincipalName ?? raw.id,
      },
    };
  }

  private cloneUser(user: User): User {
    return {
      ...user,
      m365: user.m365 ? { ...user.m365 } : undefined,
      google: user.google ? { ...user.google } : undefined,
    };
  }

  private cloneAuditEntry(snapshot: AuditEntry): AuditEntry {
    return {
      ...snapshot,
      before: this.cloneUser(snapshot.before),
      after: this.cloneUser(snapshot.after),
    };
  }

  private extractErrorMessage(raw: unknown): string {
    if (!raw || typeof raw !== 'object') {
      return 'graph request failed';
    }

    const payload = raw as { error?: { message?: string } & Record<string, unknown> };
    if (typeof payload.error === 'object' && payload.error !== null && 'message' in payload.error) {
      return String((payload.error as { message?: string }).message);
    }

    return 'graph request failed';
  }

  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
