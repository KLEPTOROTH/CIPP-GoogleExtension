import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { createAuditStoreFromEnv, type AuditStore } from '@cipp-google/audit';
import {
  type Customer,
  type IdentityProvider,
  executeAction,
  type ExecuteActionName,
} from '@cipp-google/core';

type AdapterPair = { m365: IdentityProvider; google: IdentityProvider };

type AdapterFactory = () => Promise<AdapterPair>;

interface SuspendRequestBody {
  actorId?: string;
  dryRun?: boolean;
}

interface NormalizedApiError {
  status: number;
  error: 'API_ERROR';
  code: string;
  message: string;
}

interface SuspendRouteResult {
  status: number;
  action: string;
  chip: string;
  actorId?: string;
  customerId: string;
  userKey: string;
  m365: {
    before: unknown;
    mutation: unknown;
    after: unknown;
  };
  google: {
    before: unknown;
    mutation: unknown;
    after: unknown;
  };
  audit: {
    attempted: boolean;
    applied: boolean;
    m365Applied: boolean;
    googleApplied: boolean;
    startedAt: string;
    finishedAt: string;
    status: number;
  };
}

let auditStore: AuditStore | undefined;
let auditStoreInitializationError: Error | undefined;

try {
  auditStore = createAuditStoreFromEnv({ requireDurable: true });
} catch (error) {
  auditStoreInitializationError =
    error instanceof Error ? error : new Error('Durable audit store initialization failed.');
}

const MAX_ACTOR_ID_CHARS = 128;
const ACTOR_ID_SAFE_PATTERN = /^[\w.-@+:/]{1,128}$/;

function createTypedError(code: string, status: number, message: string): NormalizedApiError {
  return {
    status,
    error: 'API_ERROR',
    code,
    message,
  };
}

function isNormalizedApiError(value: unknown): value is NormalizedApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as NormalizedApiError).error === 'API_ERROR' &&
    typeof (value as NormalizedApiError).code === 'string' &&
    typeof (value as NormalizedApiError).message === 'string' &&
    typeof (value as NormalizedApiError).status === 'number'
  );
}

function parseBody(raw: unknown): SuspendRequestBody {
  if (raw === undefined || raw === null) {
    return {};
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw createTypedError('VALIDATION_ERROR', 400, 'Request body must be a JSON object.');
  }

  const candidate = raw as SuspendRequestBody;

  if (
    candidate.actorId !== undefined &&
    (typeof candidate.actorId !== 'string' ||
      !candidate.actorId.trim() ||
      candidate.actorId.length > MAX_ACTOR_ID_CHARS ||
      !ACTOR_ID_SAFE_PATTERN.test(candidate.actorId))
  ) {
    throw createTypedError(
      'VALIDATION_ERROR',
      400,
      'actorId must be a non-empty safe string up to 128 chars when provided.',
    );
  }

  if (candidate.dryRun !== undefined && typeof candidate.dryRun !== 'boolean') {
    throw createTypedError('VALIDATION_ERROR', 400, 'dryRun must be a boolean when provided.');
  }

  return {
    actorId: candidate.actorId,
    dryRun: candidate.dryRun,
  };
}

function createNotConfiguredResponse(): HttpResponseInit {
  return {
    status: 503,
    jsonBody: createTypedError(
      'CONFIG_ERROR',
      503,
      'Suspend action route is present, but identity provider adapters are not wired for this runtime.',
    ),
  };
}

function createAuditStoreNotConfiguredResponse(): HttpResponseInit {
  return {
    status: 503,
    jsonBody: createTypedError(
      'AUDIT_STORE_NOT_CONFIGURED',
      503,
      'Durable audit store is not configured. Set AUDIT_STORAGE_CONNECTION_STRING, AUDIT_TABLE_NAME, and AUDIT_BLOB_CONTAINER.',
    ),
  };
}

function createAdapterFactoryDefault(): AdapterFactory {
  return async () => {
    throw new Error(
      'Action route adapters are not configured in this environment. Configure via action route dependency injection.',
    );
  };
}

let adapterFactory: AdapterFactory = createAdapterFactoryDefault();

export function setSuspendActionAdapterFactory(factory: AdapterFactory): void {
  adapterFactory = factory;
}

export function setSuspendActionAuditStore(store: AuditStore): void {
  auditStore = store;
  auditStoreInitializationError = undefined;
}

function logContextError(context: InvocationContext, message: string, error?: unknown): void {
  if (typeof context.error === 'function') {
    context.error(message, error);
    return;
  }
  if (typeof context.log === 'function') {
    context.log(message, error);
  }
}

function buildRouteResponse(actionResult: SuspendRouteResult): HttpResponseInit {
  return {
    status: actionResult.status,
    jsonBody: {
      action: actionResult.action,
      chip: actionResult.chip,
      actorId: actionResult.actorId,
      customerId: actionResult.customerId,
      userKey: actionResult.userKey,
      m365: {
        before: actionResult.m365.before,
        mutation: actionResult.m365.mutation,
        after: actionResult.m365.after,
      },
      google: {
        before: actionResult.google.before,
        mutation: actionResult.google.mutation,
        after: actionResult.google.after,
      },
      audit: {
        attempted: actionResult.audit.attempted,
        applied: actionResult.audit.applied,
        m365Applied: actionResult.audit.m365Applied,
        googleApplied: actionResult.audit.googleApplied,
        startedAt: actionResult.audit.startedAt,
        finishedAt: actionResult.audit.finishedAt,
        status: actionResult.audit.status,
      },
    },
  };
}

export async function createSuspendActionHandler(
  req: HttpRequest,
  context: InvocationContext,
  action: ExecuteActionName,
): Promise<HttpResponseInit> {
  if (!req.params.customerId || !req.params.userKey) {
    return {
      status: 400,
      jsonBody: createTypedError(
        'MALFORMED_ROUTE',
        400,
        'customerId and userKey path parameters are required.',
      ),
    };
  }

  let body: SuspendRequestBody;
  try {
    body = parseBody(await req.json());
  } catch (error) {
    const normalized = isNormalizedApiError(error)
      ? error
      : createTypedError('INVALID_REQUEST', 400, 'Request body must be valid JSON.');
    return {
      status: normalized.status,
      jsonBody: normalized,
    };
  }

  const actorId = body.actorId;

  if (body.dryRun) {
    return {
      status: 200,
      jsonBody: {
        status: 204,
        chip: action === 'suspend' ? 'Suspended' : 'Active',
        action,
        actorId,
        customerId: req.params.customerId,
        userKey: req.params.userKey,
        m365: { before: null, mutation: null, after: null },
        google: { before: null, mutation: null, after: null },
        audit: {
          attempted: false,
          applied: false,
          m365Applied: false,
          googleApplied: false,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          status: 204,
        },
      },
    };
  }

  const customer: Customer = {
    id: req.params.customerId,
    name: req.params.customerId,
  };

  const userKey = req.params.userKey;

  let adapters: AdapterPair;
  try {
    adapters = await adapterFactory();
  } catch (error) {
    logContextError(context, 'Suspension route adapter resolution failed', error);
    return createNotConfiguredResponse();
  }

  if (auditStoreInitializationError || !auditStore) {
    logContextError(
      context,
      'Durable audit store is not configured for action route.',
      auditStoreInitializationError,
    );
    return createAuditStoreNotConfiguredResponse();
  }

  const actionResult = await executeAction({
    action,
    customer,
    userKey,
    actorId,
    adapters,
    writeAudit: async (audit) => {
      await auditStore.writeAuditRecord(audit);
    },
  });

  const response: SuspendRouteResult = {
    status: actionResult.status,
    action: actionResult.action,
    chip: actionResult.chip,
    actorId: actionResult.actorId,
    customerId: actionResult.customerId,
    userKey: actionResult.userKey,
    m365: {
      before: actionResult.m365.before,
      mutation: actionResult.m365.mutation,
      after: actionResult.m365.after,
    },
    google: {
      before: actionResult.google.before,
      mutation: actionResult.google.mutation,
      after: actionResult.google.after,
    },
    audit: {
      attempted: actionResult.audit.attempted,
      applied: actionResult.audit.applied,
      m365Applied: actionResult.audit.m365Applied,
      googleApplied: actionResult.audit.googleApplied,
      startedAt: actionResult.audit.startedAt,
      finishedAt: actionResult.audit.finishedAt,
      status: actionResult.audit.status,
    },
  };

  return buildRouteResponse(response);
}

app.http('suspendUser', {
  route: 'customers/{customerId}/users/{userKey}/suspend',
  methods: ['POST'],
  authLevel: 'function',
  handler: (req, context) => createSuspendActionHandler(req, context, 'suspend'),
});

app.http('suspendUserV1', {
  route: 'v1/customers/{customerId}/users/{userKey}/suspend',
  methods: ['POST'],
  authLevel: 'function',
  handler: (req, context) => createSuspendActionHandler(req, context, 'suspend'),
});

app.http('resumeUser', {
  route: 'customers/{customerId}/users/{userKey}/resume',
  methods: ['POST'],
  authLevel: 'function',
  handler: (req, context) => createSuspendActionHandler(req, context, 'resume'),
});

app.http('resumeUserV1', {
  route: 'v1/customers/{customerId}/users/{userKey}/resume',
  methods: ['POST'],
  authLevel: 'function',
  handler: (req, context) => createSuspendActionHandler(req, context, 'resume'),
});
