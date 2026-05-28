import {
  type AuditEntry,
  type Customer,
  GenericProviderError,
  type IdentityProvider,
  NetworkTimeoutError,
  NotFoundError,
  type ProviderResult,
  QuotaExceededError,
  type User,
} from '@cipp-google/core';

export interface CippAdapterConfig {
  baseUrl: string;
  apiToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface CippCustomerDto {
  id: string;
  name: string;
}

interface CippUserDto {
  id: string;
  email: string;
  displayName: string;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerReader {
  listCustomers(): Promise<ProviderResult<readonly Customer[]>>;
}

export class CippAdapter implements IdentityProvider, CustomerReader {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CippAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async listCustomers(): Promise<ProviderResult<readonly Customer[]>> {
    return this.request('/customers', (body: unknown) => {
      const rows = asArrayStrict(body, 'customers');
      return rows.map(mapCustomer);
    });
  }

  async listUsers(customer: Customer): Promise<ProviderResult<readonly User[]>> {
    return this.request(`/customers/${encodeURIComponent(customer.id)}/users`, (body: unknown) => {
      const rows = asArrayStrict(body, 'users');
      return rows.map((row) => mapUser(row, customer.id));
    });
  }

  async getUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    return this.request(`/customers/${encodeURIComponent(customer.id)}/users/${encodeURIComponent(key)}`, (body: unknown) =>
      mapUser(body, customer.id),
    );
  }

  async suspendUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    return this.request(
      `/customers/${encodeURIComponent(customer.id)}/users/${encodeURIComponent(key)}/suspend`,
      (body: unknown) => mapUser(body, customer.id),
      { method: 'POST' },
    );
  }

  async resumeUser(customer: Customer, key: string): Promise<ProviderResult<User>> {
    return this.request(
      `/customers/${encodeURIComponent(customer.id)}/users/${encodeURIComponent(key)}/resume`,
      (body: unknown) => mapUser(body, customer.id),
      { method: 'POST' },
    );
  }

  async readUserSnapshot(customer: Customer, key: string): Promise<ProviderResult<AuditEntry>> {
    const result = await this.getUser(customer, key);
    if (!result.ok) {
      return result;
    }

    const current = result.value;
    const now = new Date().toISOString();
    return {
      ok: true,
      value: {
        customerId: customer.id,
        key,
        action: 'read',
        before: current,
        after: current,
        timestamp: now,
      },
    };
  }

  private async request<T>(
    path: string,
    mapper: (body: unknown) => T,
    init?: RequestInit,
  ): Promise<ProviderResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: init?.body,
      });

      if (response.status === 404) {
        return { ok: false, error: new NotFoundError('cipp_resource_not_found') };
      }
      if (response.status === 429) {
        return { ok: false, error: new QuotaExceededError('cipp_rate_limited') };
      }
      if (!response.ok) {
        return {
          ok: false,
          error: new GenericProviderError(`cipp_http_${response.status}`),
        };
      }

      let json: unknown;
      try {
        json = (await response.json()) as unknown;
      } catch {
        return { ok: false, error: new GenericProviderError('cipp_invalid_json') };
      }

      try {
        return { ok: true, value: mapper(json) };
      } catch {
        return { ok: false, error: new GenericProviderError('cipp_invalid_payload') };
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return {
          ok: false,
          error: new NetworkTimeoutError('cipp_request_timeout'),
        };
      }
      return {
        ok: false,
        error: new GenericProviderError('cipp_transport_error'),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function asArrayStrict(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName}_must_be_array`);
  }
  return value;
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapCustomer(row: unknown): Customer {
  const dto = asObject(row) as Partial<CippCustomerDto>;
  if (!isNonEmptyString(dto.id) || !isNonEmptyString(dto.name)) {
    throw new Error('invalid_customer_payload');
  }
  return {
    id: dto.id,
    name: dto.name,
  };
}

function mapUser(row: unknown, customerId: string): User {
  const dto = asObject(row) as Partial<CippUserDto>;
  if (
    !isNonEmptyString(dto.id) ||
    !isNonEmptyString(dto.email) ||
    !isNonEmptyString(dto.displayName) ||
    typeof dto.suspended !== 'boolean' ||
    !isIsoDateString(dto.createdAt) ||
    !isIsoDateString(dto.updatedAt)
  ) {
    throw new Error('invalid_user_payload');
  }

  return {
    id: dto.id,
    customerId,
    email: dto.email,
    displayName: dto.displayName,
    suspended: dto.suspended,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError';
}
