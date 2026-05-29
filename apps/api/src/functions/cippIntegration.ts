import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';

import { CippConnectService, createCippConnectionStore } from '../cipp/connect.js';
import type { CippConnectionInput } from '../cipp/connect.js';
import { createCippSyncStore } from '../cipp/store.js';

const integrationStore = createCippConnectionStore();
const syncStore = createCippSyncStore();
const service = new CippConnectService({ integrationStore, syncStore });

interface ConnectionRequestBody {
  baseUrl?: string;
  secretRef?: string;
}

export async function validateCippIntegration(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const input = await readConnectionInput(request);
  if (!input) {
    return problem(400, 'INVALID_REQUEST', 'baseUrl and secretRef are required.');
  }

  const result = await service.validate(input);
  return {
    status: result.ok ? 200 : statusForValidationError(result.error?.code),
    jsonBody: result,
  };
}

export async function connectCippIntegration(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const input = await readConnectionInput(request);
  if (!input) {
    return problem(400, 'INVALID_REQUEST', 'baseUrl and secretRef are required.');
  }

  const result = await service.connect(input);
  return {
    status: result.validation.ok ? 200 : statusForValidationError(result.validation.error?.code),
    jsonBody: result,
  };
}

export async function reconnectCippIntegration(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const input = await readConnectionInput(request);
  if (!input) {
    return problem(400, 'INVALID_REQUEST', 'baseUrl and secretRef are required.');
  }

  const result = await service.reconnect(input);
  return {
    status: result.validation.ok ? 200 : statusForValidationError(result.validation.error?.code),
    jsonBody: result,
  };
}

export async function disconnectCippIntegration(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: { state: await service.disconnect() },
  };
}

export async function getCippIntegrationStatus(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: { state: await service.status() },
  };
}

export async function importCippCustomers(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const result = await service.importCustomers();
    return { status: 200, jsonBody: result };
  } catch {
    return problem(409, 'NOT_CONNECTED', 'Connect to CIPP before importing customers.');
  }
}

export async function listCippCustomers(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: { customers: await service.customers() },
  };
}

async function readConnectionInput(request: HttpRequest): Promise<CippConnectionInput | undefined> {
  try {
    const body = (await request.json()) as ConnectionRequestBody;
    if (!body.baseUrl?.trim() || !body.secretRef?.trim()) {
      return undefined;
    }
    return { baseUrl: body.baseUrl, secretRef: body.secretRef };
  } catch {
    return undefined;
  }
}

function problem(status: number, code: string, message: string): HttpResponseInit {
  return {
    status,
    jsonBody: { ok: false, error: { code, message } },
  };
}

function statusForValidationError(code?: string): number {
  if (code === 'INVALID_URL') {
    return 400;
  }
  if (code === 'AUTH_ERROR' || code === 'SECRET_REF_NOT_FOUND') {
    return 401;
  }
  if (code === 'MISSING_SCOPE') {
    return 403;
  }
  return 502;
}

app.http('validateCippIntegration', {
  route: 'v1/integrations/cipp/validate',
  methods: ['POST'],
  authLevel: 'function',
  handler: validateCippIntegration,
});

app.http('connectCippIntegration', {
  route: 'v1/integrations/cipp/connect',
  methods: ['POST'],
  authLevel: 'function',
  handler: connectCippIntegration,
});

app.http('reconnectCippIntegration', {
  route: 'v1/integrations/cipp/reconnect',
  methods: ['POST'],
  authLevel: 'function',
  handler: reconnectCippIntegration,
});

app.http('disconnectCippIntegration', {
  route: 'v1/integrations/cipp/disconnect',
  methods: ['POST'],
  authLevel: 'function',
  handler: disconnectCippIntegration,
});

app.http('getCippIntegrationStatus', {
  route: 'v1/integrations/cipp/status',
  methods: ['GET'],
  authLevel: 'function',
  handler: getCippIntegrationStatus,
});

app.http('importCippCustomers', {
  route: 'v1/integrations/cipp/customers/import',
  methods: ['POST'],
  authLevel: 'function',
  handler: importCippCustomers,
});

app.http('listCippCustomers', {
  route: 'v1/integrations/cipp/customers',
  methods: ['GET'],
  authLevel: 'function',
  handler: listCippCustomers,
});
