import type { Customer } from '@cipp-google/core';

import { runReconcile } from './reconcile.js';
import type { CippSyncStore } from './store.js';
import type { CustomerMirrorRecord } from './types.js';

export type CippIntegrationStatus = 'connected' | 'degraded' | 'disconnected' | 'validating';

export interface CippIntegrationState {
  integrationId: string;
  baseUrl?: string;
  secretRef?: string;
  status: CippIntegrationStatus;
  lastValidatedAt?: string;
  lastImportedAt?: string;
  lastDisconnectedAt?: string;
  lastErrorCode?: CippConnectErrorCode;
  version: number;
}

export type CippConnectErrorCode =
  | 'INVALID_URL'
  | 'AUTH_ERROR'
  | 'MISSING_SCOPE'
  | 'CONNECTIVITY_ERROR'
  | 'SECRET_REF_NOT_FOUND';

export interface CippConnectionStore {
  get(): Promise<CippIntegrationState>;
  save(state: CippIntegrationState): Promise<CippIntegrationState>;
}

export interface CippConnectionInput {
  baseUrl: string;
  secretRef: string;
}

export interface CippValidationResult {
  ok: boolean;
  error?: {
    code: CippConnectErrorCode;
    message: string;
  };
  checkedAt: string;
}

interface CippConnectServiceOptions {
  integrationStore: CippConnectionStore;
  syncStore: CippSyncStore;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  adapterFactory?: (config: { baseUrl: string; apiToken: string }) => CustomerListReader;
}

interface CustomerListReader {
  listCustomers(): Promise<{ ok: true; value: readonly Customer[] } | { ok: false; error: Error }>;
}

const INTEGRATION_ID = 'cipp';

export class InMemoryCippConnectionStore implements CippConnectionStore {
  private state: CippIntegrationState = {
    integrationId: INTEGRATION_ID,
    status: 'disconnected',
    version: 0,
  };

  get(): Promise<CippIntegrationState> {
    return Promise.resolve({ ...this.state });
  }

  save(state: CippIntegrationState): Promise<CippIntegrationState> {
    this.state = { ...state };
    return Promise.resolve({ ...this.state });
  }
}

export class CippConnectService {
  private readonly integrationStore: CippConnectionStore;
  private readonly syncStore: CippSyncStore;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => string;
  private readonly adapterFactory?: CippConnectServiceOptions['adapterFactory'];

  constructor(options: CippConnectServiceOptions) {
    this.integrationStore = options.integrationStore;
    this.syncStore = options.syncStore;
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date().toISOString());
    this.adapterFactory = options.adapterFactory;
  }

  async validate(input: CippConnectionInput): Promise<CippValidationResult> {
    return this.validateWithAdapter(input);
  }

  async connect(input: CippConnectionInput): Promise<{
    validation: CippValidationResult;
    state: CippIntegrationState;
    importSummary?: { imported: number; repaired: number };
  }> {
    const validation = await this.validateWithAdapter(input);
    if (!validation.ok) {
      return { validation, state: await this.integrationStore.get() };
    }

    await this.saveConnectedState(input, validation.checkedAt);
    const importSummary = await this.importCustomers();
    return { validation, state: importSummary.state, importSummary: importSummary.summary };
  }

  async reconnect(input: CippConnectionInput): Promise<{
    validation: CippValidationResult;
    state: CippIntegrationState;
  }> {
    const validation = await this.validateWithAdapter(input);
    if (!validation.ok) {
      const existing = await this.integrationStore.get();
      return {
        validation,
        state: await this.integrationStore.save({
          ...existing,
          status: existing.status === 'connected' ? 'degraded' : existing.status,
          lastErrorCode: validation.error?.code,
          version: existing.version + 1,
        }),
      };
    }

    return {
      validation,
      state: await this.saveConnectedState(input, validation.checkedAt),
    };
  }

  async disconnect(): Promise<CippIntegrationState> {
    const existing = await this.integrationStore.get();
    return this.integrationStore.save({
      integrationId: INTEGRATION_ID,
      baseUrl: existing.baseUrl,
      status: 'disconnected',
      lastDisconnectedAt: this.now(),
      version: existing.version + 1,
    });
  }

  async status(): Promise<CippIntegrationState & { customerCount: number }> {
    const [state, customers] = await Promise.all([
      this.integrationStore.get(),
      this.syncStore.snapshot(),
    ]);
    return { ...state, customerCount: customers.length };
  }

  async customers(): Promise<readonly CustomerMirrorRecord[]> {
    return this.syncStore.snapshot();
  }

  async importCustomers(): Promise<{
    state: CippIntegrationState;
    summary: { imported: number; repaired: number };
  }> {
    const state = await this.integrationStore.get();
    if (state.status !== 'connected' || !state.baseUrl || !state.secretRef) {
      throw new Error('cipp_integration_not_connected');
    }

    const adapter = await this.createAdapter({ baseUrl: state.baseUrl, secretRef: state.secretRef });
    const customers = await adapter.listCustomers();
    if (!customers.ok) {
      throw new Error('cipp_customer_import_failed');
    }

    const observedAt = this.now();
    const remote = customers.value.map((customer) => toMirrorRecord(customer, observedAt));
    const reconciled = await runReconcile(
      {
        async listCustomerMirrorSnapshot() {
          return remote;
        },
      },
      this.syncStore,
    );
    const saved = await this.integrationStore.save({
      ...state,
      lastImportedAt: observedAt,
      version: state.version + 1,
    });

    return {
      state: saved,
      summary: { imported: remote.length, repaired: reconciled.repaired },
    };
  }

  private async saveConnectedState(
    input: CippConnectionInput,
    checkedAt: string,
  ): Promise<CippIntegrationState> {
    const existing = await this.integrationStore.get();
    return this.integrationStore.save({
      integrationId: INTEGRATION_ID,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      secretRef: input.secretRef,
      status: 'connected',
      lastValidatedAt: checkedAt,
      version: existing.version + 1,
    });
  }

  private async validateWithAdapter(input: CippConnectionInput): Promise<CippValidationResult> {
    const checkedAt = this.now();
    const url = parseBaseUrl(input.baseUrl);
    if (!url) {
      return failure('INVALID_URL', 'Enter a valid HTTPS CIPP base URL.', checkedAt);
    }

    const token = resolveSecretRef(input.secretRef, this.env);
    if (!token) {
      return failure('SECRET_REF_NOT_FOUND', 'Credential reference could not be resolved.', checkedAt);
    }

    const adapter = await this.createAdapter({ baseUrl: url, secretRef: input.secretRef });
    const result = await adapter.listCustomers();
    if (result.ok) {
      return { ok: true, checkedAt };
    }

    const code = mapValidationError(result.error);
    return failure(code, messageFor(code), checkedAt);
  }

  private async createAdapter(input: {
    baseUrl: string;
    secretRef: string;
  }): Promise<CustomerListReader> {
    const apiToken = resolveSecretRef(input.secretRef, this.env);
    if (!apiToken) {
      throw new Error('cipp_secret_ref_not_found');
    }
    if (this.adapterFactory) {
      return this.adapterFactory({ baseUrl: input.baseUrl, apiToken });
    }
    const { CippAdapter } = await import('@cipp-google/adapter-cipp');
    return new CippAdapter({ baseUrl: input.baseUrl, apiToken });
  }
}

function parseBaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname) {
      return undefined;
    }
    return normalizeBaseUrl(url.toString());
  } catch {
    return undefined;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveSecretRef(secretRef: string, env: NodeJS.ProcessEnv): string | undefined {
  if (!secretRef.trim()) {
    return undefined;
  }

  if (
    env.CIPP_API_TOKEN &&
    (!env.CIPP_API_SECRET_REF || env.CIPP_API_SECRET_REF === secretRef)
  ) {
    return env.CIPP_API_TOKEN;
  }

  const envName = `CIPP_SECRET_${secretRef.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
  return env[envName];
}

function toMirrorRecord(customer: Customer, observedAt: string): CustomerMirrorRecord {
  return {
    customerId: customer.id,
    displayName: customer.name,
    cippTenantId: customer.id,
    sourceVersion: 0,
    lastObservedAt: observedAt,
    bindingState: 'bound',
  };
}

function failure(
  code: CippConnectErrorCode,
  message: string,
  checkedAt: string,
): CippValidationResult {
  return { ok: false, checkedAt, error: { code, message } };
}

function mapValidationError(error: Error): CippConnectErrorCode {
  if (error.message.includes('401') || error.message.includes('403')) {
    return 'AUTH_ERROR';
  }
  if (error.message.includes('404') || error.message.includes('invalid_payload')) {
    return 'MISSING_SCOPE';
  }
  return 'CONNECTIVITY_ERROR';
}

function messageFor(code: CippConnectErrorCode): string {
  switch (code) {
    case 'AUTH_ERROR':
      return 'CIPP rejected the credential reference.';
    case 'MISSING_SCOPE':
      return 'Credential validated, but required CIPP customer access is missing.';
    case 'CONNECTIVITY_ERROR':
      return 'CIPP endpoint could not be reached or returned an unexpected response.';
    case 'INVALID_URL':
      return 'Enter a valid HTTPS CIPP base URL.';
    case 'SECRET_REF_NOT_FOUND':
      return 'Credential reference could not be resolved.';
  }
}
