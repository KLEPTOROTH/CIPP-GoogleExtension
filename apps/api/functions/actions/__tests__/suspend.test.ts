import type { HttpRequest, InvocationContext } from '@azure/functions';
import { MockAdapter } from '../../../../../packages/adapter-mock/src';
import {
  GenericProviderError,
  NetworkTimeoutError,
  QuotaExceededError,
  type Customer,
  type User,
} from '@cipp-google/core';
import { describe, expect, it } from 'vitest';

import {
  createSuspendActionHandler,
  setSuspendActionAdapterFactory,
  setSuspendActionAuditStore,
} from '../suspend';

interface MatrixCase {
  name: string;
  m365: 'ok' | 'generic' | 'quota' | 'timeout';
  google: 'ok' | 'generic' | 'quota' | 'timeout';
  expectedStatus: 200 | 207 | 502;
  expectedUiChip: 'Suspended' | 'Inconsistent' | 'Failure';
  expectedApplied: {
    m365: boolean;
    google: boolean;
  };
}

const customer: Customer = {
  id: 'customer-gst13-api',
  name: 'Contoso',
};

const seedUsers: User[] = [
  {
    id: 'user-gst13',
    customerId: 'customer-gst13-api',
    email: 'sre@example.com',
    displayName: 'SRE User',
    suspended: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

type RouteContext = InvocationContext;
type RouteRequest = HttpRequest;

function buildRequestWithBody(userKey: string, body?: object): RouteRequest {
  return {
    params: {
      customerId: customer.id,
      userKey,
    },
    json: async () => body,
  } as RouteRequest;
}

function failureFor(mode: MatrixCase['m365' | 'google']) {
  if (mode === 'generic') {
    return GenericProviderError;
  }
  if (mode === 'quota') {
    return QuotaExceededError;
  }
  return NetworkTimeoutError;
}

const cases: MatrixCase[] = [
  {
    name: 'success-both',
    m365: 'ok',
    google: 'ok',
    expectedStatus: 200,
    expectedUiChip: 'Suspended',
    expectedApplied: { m365: true, google: true },
  },
  {
    name: 'm365-ok-google-generic',
    m365: 'ok',
    google: 'generic',
    expectedStatus: 207,
    expectedUiChip: 'Inconsistent',
    expectedApplied: { m365: true, google: false },
  },
  {
    name: 'm365-ok-google-quota',
    m365: 'ok',
    google: 'quota',
    expectedStatus: 207,
    expectedUiChip: 'Inconsistent',
    expectedApplied: { m365: true, google: false },
  },
  {
    name: 'm365-ok-google-timeout',
    m365: 'ok',
    google: 'timeout',
    expectedStatus: 207,
    expectedUiChip: 'Inconsistent',
    expectedApplied: { m365: true, google: false },
  },
  {
    name: 'm365-generic-google-ok',
    m365: 'generic',
    google: 'ok',
    expectedStatus: 207,
    expectedUiChip: 'Inconsistent',
    expectedApplied: { m365: false, google: true },
  },
  {
    name: 'm365-generic-google-quota',
    m365: 'generic',
    google: 'quota',
    expectedStatus: 502,
    expectedUiChip: 'Failure',
    expectedApplied: { m365: false, google: false },
  },
  {
    name: 'm365-generic-google-timeout',
    m365: 'generic',
    google: 'timeout',
    expectedStatus: 502,
    expectedUiChip: 'Failure',
    expectedApplied: { m365: false, google: false },
  },
  {
    name: 'm365-timeout-google-ok',
    m365: 'timeout',
    google: 'ok',
    expectedStatus: 207,
    expectedUiChip: 'Inconsistent',
    expectedApplied: { m365: false, google: true },
  },
  {
    name: 'm365-timeout-google-generic',
    m365: 'timeout',
    google: 'generic',
    expectedStatus: 502,
    expectedUiChip: 'Failure',
    expectedApplied: { m365: false, google: false },
  },
];

describe('suspend action handler', () => {
  const stubContext = {} as RouteContext;
  setSuspendActionAuditStore({
    writeAuditRecord: async () => {},
    readAudit: async () => ({ items: [], nextCursor: undefined }),
  });

  it('maps route-level suspend matrix to 200/207/502 + chip + per-side mutation state', async () => {
    for (const scenario of cases) {
      const m365 = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });
      const google = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });

      if (scenario.m365 !== 'ok') {
        m365.failNext('suspendUser', failureFor(scenario.m365));
      }
      if (scenario.google !== 'ok') {
        google.failNext('suspendUser', failureFor(scenario.google));
      }

      setSuspendActionAdapterFactory(async () => ({
        m365,
        google,
      }));

      const response = await createSuspendActionHandler(
        buildRequestWithBody('user-gst13'),
        stubContext,
        'suspend',
      );

      expect(response.status).toBe(scenario.expectedStatus, scenario.name);

      const body = response.jsonBody as {
        action: 'suspend';
        chip: 'Suspended' | 'Inconsistent' | 'Failure';
        m365: { mutation: { ok: boolean }; after: { ok: boolean; value?: { action: string; after: { suspended: boolean } } } };
        google: { mutation: { ok: boolean }; after: { ok: boolean; value?: { action: string; after: { suspended: boolean } } } };
      };

      expect(body.chip).toBe(scenario.expectedUiChip, scenario.name);
      expect(body.m365.mutation.ok).toBe(scenario.expectedApplied.m365, scenario.name);
      expect(body.google.mutation.ok).toBe(scenario.expectedApplied.google, scenario.name);
      if (scenario.expectedApplied.m365) {
        expect(body.m365.after.ok).toBe(true, scenario.name);
        expect(body.m365.after.value?.action).toBe('suspend', scenario.name);
        expect(body.m365.after.value?.after.suspended).toBe(true, scenario.name);
      }
      if (scenario.expectedApplied.google) {
        expect(body.google.after.ok).toBe(true, scenario.name);
        expect(body.google.after.value?.action).toBe('suspend', scenario.name);
        expect(body.google.after.value?.after.suspended).toBe(true, scenario.name);
      }
      if (!scenario.expectedApplied.m365 && !scenario.expectedApplied.google) {
        expect(response.status).toBe(502, scenario.name);
      }
    }
  });

  it('returns 400 for malformed route params', async () => {
    const response = await createSuspendActionHandler(
      ({ params: {}, json: async () => ({}) } as unknown) as RouteRequest,
      ({} as unknown) as RouteContext,
      'suspend',
    );

    expect(response.status).toBe(400);
    expect((response.jsonBody as { code: string }).code).toBe('MALFORMED_ROUTE');
  });

  it('returns 400 for invalid json body', async () => {
    const response = await createSuspendActionHandler(
      ({
        params: {
          customerId: customer.id,
          userKey: seedUsers[0]!.id,
        },
        json: async () => {
          throw new Error('invalid body');
        },
      } as unknown) as RouteRequest,
      ({} as unknown) as RouteContext,
      'suspend',
    );

    expect(response.status).toBe(400);
    expect((response.jsonBody as { code: string }).code).toBe('INVALID_REQUEST');
  });

  it('returns dry-run response without invoking adapters', async () => {
    let invoked = false;
    setSuspendActionAdapterFactory(async () => {
      invoked = true;
      throw new Error('should not be called');
    });

    const response = await createSuspendActionHandler(
      ({
        params: {
          customerId: customer.id,
          userKey: seedUsers[0]!.id,
        },
        json: async () => ({ dryRun: true }),
      } as unknown) as RouteRequest,
      ({} as unknown) as RouteContext,
      'suspend',
    );

    expect(response.status).toBe(200);
    expect((response.jsonBody as { status: number }).status).toBe(204);
    expect(invoked).toBe(false);
  });

  it('accepts empty request body for suspend and resume', async () => {
    const m365 = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });
    const google = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });

    setSuspendActionAdapterFactory(async () => ({
      m365,
      google,
    }));

    const suspendResponse = await createSuspendActionHandler(
      buildRequestWithBody(seedUsers[0]!.id),
      stubContext,
      'suspend',
    );

    expect(suspendResponse.status).toBe(200);

    const resumeResponse = await createSuspendActionHandler(
      buildRequestWithBody(seedUsers[0]!.id),
      stubContext,
      'resume',
    );

    expect(resumeResponse.status).toBe(200);
  });
});
