import {
  type Customer,
  type ProviderError,
  type ProviderResult,
  type User,
  type AuditEntry,
  GenericProviderError,
} from './types.js';
import type { IdentityProvider } from './identity-provider.js';

export type ExecuteActionName = 'suspend' | 'resume';

export type ExecuteActionStatus = 200 | 207 | 502;

export interface ExecuteActionAdapters {
  m365: IdentityProvider;
  google: IdentityProvider;
}

export interface ExecuteActionInput {
  action: ExecuteActionName;
  customer: Customer;
  userKey: string;
  actorId?: string;
  adapters: ExecuteActionAdapters;
  correlationId?: string;
  clock?: () => string;
  writeAudit?: (audit: ExecuteActionAudit) => Promise<void>;
}

export type ActionChip = 'Suspended' | 'Active' | 'Inconsistent' | 'Failure';

export interface ExecuteActionChannelResult {
  before: ProviderResult<AuditEntry>;
  mutation: ProviderResult<User>;
  after: ProviderResult<AuditEntry>;
}

export interface ExecuteActionAudit {
  action: ExecuteActionName;
  customerId: string;
  key: string;
  correlationId: string;
  actorId?: string;
  attempted: boolean;
  applied: boolean;
  m365Applied: boolean;
  googleApplied: boolean;
  startedAt: string;
  finishedAt: string;
  status: ExecuteActionStatus;
  m365: ExecuteActionChannelResult;
  google: ExecuteActionChannelResult;
}

export interface ExecuteActionResult {
  status: ExecuteActionStatus;
  correlationId: string;
  action: ExecuteActionName;
  actorId?: string;
  customerId: string;
  userKey: string;
  chip: ActionChip;
  m365: ExecuteActionChannelResult;
  google: ExecuteActionChannelResult;
  audit: ExecuteActionAudit;
}

const defaultClock = (): string => new Date().toISOString();

const normalizeProviderError = (error: unknown): ProviderError => {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error && 'statusCode' in error) {
    return error as ProviderError;
  }
  const message = error instanceof Error ? error.message : 'provider action threw unexpectedly';
  return new GenericProviderError(message);
};

async function safeProviderResult<T>(
  task: () => Promise<ProviderResult<T>>,
): Promise<ProviderResult<T>> {
  try {
    return await task();
  } catch (error: unknown) {
    return { ok: false, error: normalizeProviderError(error) };
  }
}

export function resolveActionChip(action: ExecuteActionName, status: ExecuteActionStatus): ActionChip {
  if (status === 200) {
    return action === 'suspend' ? 'Suspended' : 'Active';
  }
  if (status === 207) {
    return 'Inconsistent';
  }
  return 'Failure';
}

function mapStatus(m365Verified: boolean, googleVerified: boolean): ExecuteActionStatus {
  if (!m365Verified && !googleVerified) {
    return 502;
  }
  if (!m365Verified || !googleVerified) {
    return 207;
  }
  return 200;
}

export async function executeAction(input: ExecuteActionInput): Promise<ExecuteActionResult> {
  const startedAt = (input.clock ?? defaultClock)();
  const { adapters, customer, userKey, action, actorId, correlationId = `c-${Date.now()}` } = input;
  const writeAudit = input.writeAudit ?? (async () => undefined);

  const mutation =
    action === 'suspend'
      ? (provider: IdentityProvider, key: string) => provider.suspendUser(customer, key)
      : (provider: IdentityProvider, key: string) => provider.resumeUser(customer, key);

  const [m365Before, googleBefore] = await Promise.all([
    safeProviderResult(() => adapters.m365.readUserSnapshot(customer, userKey)),
    safeProviderResult(() => adapters.google.readUserSnapshot(customer, userKey)),
  ]);

  const [m365Mutation, googleMutation] = await Promise.all([
    safeProviderResult(() => mutation(adapters.m365, userKey)),
    safeProviderResult(() => mutation(adapters.google, userKey)),
  ]);

  const [m365After, googleAfter] = await Promise.all([
    safeProviderResult(() => adapters.m365.readUserSnapshot(customer, userKey)),
    safeProviderResult(() => adapters.google.readUserSnapshot(customer, userKey)),
  ]);

  const m365Applied = m365Mutation.ok;
  const googleApplied = googleMutation.ok;
  const m365Verified = m365Applied && m365Before.ok && m365After.ok;
  const googleVerified = googleApplied && googleBefore.ok && googleAfter.ok;
  const providerStatus = mapStatus(m365Verified, googleVerified);

  const result: ExecuteActionResult = {
    status: providerStatus,
    correlationId,
    action,
    actorId,
    customerId: customer.id,
    userKey,
    chip: resolveActionChip(action, providerStatus),
    m365: {
      before: m365Before,
      mutation: m365Mutation,
      after: m365After,
    },
    google: {
      before: googleBefore,
      mutation: googleMutation,
      after: googleAfter,
    },
    audit: {
      action,
      customerId: customer.id,
      key: userKey,
      correlationId,
      actorId,
      attempted: true,
      applied: m365Applied || googleApplied,
      m365Applied,
      googleApplied,
      startedAt,
      finishedAt: (input.clock ?? defaultClock)(),
      status: providerStatus,
      m365: {
        before: m365Before,
        mutation: m365Mutation,
        after: m365After,
      },
      google: {
        before: googleBefore,
        mutation: googleMutation,
        after: googleAfter,
      },
    },
  };

  try {
    await writeAudit(result.audit);
  } catch (error: unknown) {
    if (providerStatus !== 502) {
      result.status = 502;
      result.chip = resolveActionChip(action, 502);
      result.audit.status = 502;
    }

    if (!result.m365.mutation.ok && !result.google.mutation.ok) {
      return result;
    }

    const message = error instanceof Error ? error.message : 'audit write failed';
    const auditWriteError: ProviderResult<User> = {
      ok: false,
      error: new GenericProviderError(`audit_write_failed:${message}`),
    };

    if (result.m365.mutation.ok) {
      result.m365.mutation = auditWriteError;
      result.audit.m365.mutation = auditWriteError;
    }
    if (result.google.mutation.ok) {
      result.google.mutation = auditWriteError;
      result.audit.google.mutation = auditWriteError;
    }

    result.audit.m365Applied = result.m365.mutation.ok;
    result.audit.googleApplied = result.google.mutation.ok;
    result.audit.applied = result.audit.m365Applied || result.audit.googleApplied;
  }

  return result;
}
