import {
  type IdentityProvider,
  executeAction,
  GenericProviderError,
  NetworkTimeoutError,
  QuotaExceededError,
  type Customer,
  type User,
} from '@cipp-google/core';
import { expect, test } from 'vitest';

import { MockAdapter } from '../src/index.js';

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
  id: 'customer-gst13',
  name: 'Contoso',
};

const seedUsers: User[] = [
  {
    id: 'user-gst13',
    customerId: 'customer-gst13',
    email: 'sre@example.com',
    displayName: 'SRE User',
    suspended: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

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

test('MockAdapter partial-failure matrix for suspend mirrors expected API/audit/chip outcomes', async () => {
  const key = 'user-gst13';

  for (const scenario of cases) {
    const m365 = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });
    const google = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });
    let writeCount = 0;

    if (scenario.m365 !== 'ok') {
      m365.failNext('suspendUser', failureFor(scenario.m365));
    }
    if (scenario.google !== 'ok') {
      google.failNext('suspendUser', failureFor(scenario.google));
    }

    const result = await executeAction({
      action: 'suspend',
      customer,
      userKey: key,
      adapters: { m365, google },
      writeAudit: async () => {
        writeCount += 1;
      },
    });

    const m365Before = result.m365.before;
    const googleBefore = result.google.before;
    const m365After = result.m365.after;
    const googleAfter = result.google.after;

    if (!m365Before.ok || !googleBefore.ok) {
      expect.fail('readUserSnapshot must succeed for seeded users');
    }
    if (!m365After.ok || !googleAfter.ok) {
      expect.fail('post-action readUserSnapshot must succeed for seeded users');
    }

    expect(result.status).toBe(scenario.expectedStatus);
    expect(result.chip).toBe(scenario.expectedUiChip);

    expect(result.m365.mutation.ok).toBe(scenario.expectedApplied.m365);
    expect(result.google.mutation.ok).toBe(scenario.expectedApplied.google);

    expect(m365After.value.action).toBe(scenario.expectedApplied.m365 ? 'suspend' : 'read');
    expect(googleAfter.value.action).toBe(scenario.expectedApplied.google ? 'suspend' : 'read');
    expect(m365After.value.customerId).toBe(customer.id);
    expect(googleAfter.value.customerId).toBe(customer.id);

    if (scenario.expectedApplied.m365) {
      expect(m365After.value.after.suspended).toBe(true);
    }

    if (scenario.expectedApplied.google) {
      expect(googleAfter.value.after.suspended).toBe(true);
    }

    if (!scenario.expectedApplied.m365 && !scenario.expectedApplied.google) {
      expect(result.status).toBe(502);
      expect(m365After.value.before.suspended).toBe(false);
      expect(m365After.value.after.suspended).toBe(false);
      expect(googleAfter.value.before.suspended).toBe(false);
      expect(googleAfter.value.after.suspended).toBe(false);
    }

    expect(writeCount).toBe(1);
  }
});

test('executeAction normalizes thrown adapter exceptions to failed provider results', async () => {
  const throwingAdapter: IdentityProvider = {
    listUsers: async () => ({ ok: false, error: new GenericProviderError('method_not_supported') }),
    getUser: async () => ({ ok: false, error: new GenericProviderError('not_found') }),
    suspendUser: async () => {
      throw new Error('suspend transport crashed');
    },
    resumeUser: async () => {
      throw new Error('resume transport crashed');
    },
    readUserSnapshot: async () => ({
      ok: true,
      value: {
        customerId: customer.id,
        key: seedUsers[0]!.id,
        action: 'read',
        before: {
          id: seedUsers[0]!.id,
          customerId: customer.id,
          email: seedUsers[0]!.email,
          displayName: seedUsers[0]!.displayName,
          suspended: false,
          createdAt: seedUsers[0]!.createdAt,
          updatedAt: seedUsers[0]!.updatedAt,
        },
        after: {
          id: seedUsers[0]!.id,
          customerId: customer.id,
          email: seedUsers[0]!.email,
          displayName: seedUsers[0]!.displayName,
          suspended: false,
          createdAt: seedUsers[0]!.createdAt,
          updatedAt: seedUsers[0]!.updatedAt,
        },
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    }),
  };

  let writeCount = 0;
  const result = await executeAction({
    action: 'suspend',
    customer,
    userKey: seedUsers[0]!.id,
    adapters: { m365: throwingAdapter, google: throwingAdapter },
    writeAudit: async () => {
      writeCount += 1;
    },
  });

  expect(result.status).toBe(502);
  expect(result.m365.mutation.ok).toBe(false);
  expect(result.google.mutation.ok).toBe(false);
  if (result.m365.mutation.ok || result.google.mutation.ok) {
    throw new Error('expected both mutation paths to fail');
  }
  expect(result.m365.mutation.error.code).toBe('generic');
  expect(result.google.mutation.error.code).toBe('generic');
  expect(writeCount).toBe(1);
});

test('executeAction returns 502 when audit persistence fails after provider mutation success', async () => {
  const m365 = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });
  const google = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });

  const result = await executeAction({
    action: 'suspend',
    customer,
    userKey: seedUsers[0]!.id,
    adapters: { m365, google },
    writeAudit: async () => {
      throw new Error('table unavailable');
    },
  });

  expect(result.status).toBe(502);
  expect(result.chip).toBe('Failure');
  expect(result.audit.status).toBe(502);
  expect(result.m365.mutation.ok).toBe(false);
  expect(result.google.mutation.ok).toBe(false);
  expect(result.audit.m365.mutation.ok).toBe(false);
  expect(result.audit.google.mutation.ok).toBe(false);
  expect(result.audit.m365Applied).toBe(false);
  expect(result.audit.googleApplied).toBe(false);
  expect(result.audit.applied).toBe(false);
});

test('executeAction audit payload stays aligned with channel mutations after audit write failure', async () => {
  const m365 = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });
  const google = new MockAdapter({ initialUsers: [...seedUsers], latencyMs: 0 });
  google.failNext('suspendUser', GenericProviderError);

  const result = await executeAction({
    action: 'suspend',
    customer,
    userKey: seedUsers[0]!.id,
    adapters: { m365, google },
    writeAudit: async () => {
      throw new Error('blob unavailable');
    },
  });

  expect(result.status).toBe(502);
  expect(result.m365.mutation.ok).toBe(false);
  expect(result.google.mutation.ok).toBe(false);
  expect(result.audit.m365.mutation.ok).toBe(result.m365.mutation.ok);
  expect(result.audit.google.mutation.ok).toBe(result.google.mutation.ok);
  expect(result.audit.m365Applied).toBe(false);
  expect(result.audit.googleApplied).toBe(false);
  expect(result.audit.applied).toBe(false);
});
