import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { executeAction } from '../src/execute-action.js';
import type { Customer, IdentityProvider, ProviderResult, User, AuditEntry } from '../src/index.js';

const customer: Customer = {
  id: 'cust-1',
  name: 'Contoso',
};

describe('executeAction invariants', () => {
  it('returns 207 when a channel mutation reports ok but post-state does not match action', async () => {
    const activeUser: User = {
      id: 'u1',
      customerId: customer.id,
      email: 'u1@example.com',
      displayName: 'U1',
      suspended: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const suspendedUser: User = {
      ...activeUser,
      suspended: true,
    };
    const readAudit = (user: User): AuditEntry => ({
      customerId: customer.id,
      key: user.id,
      action: 'read',
      before: user,
      after: user,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const healthyProvider: IdentityProvider = {
      async listUsers(): Promise<ProviderResult<readonly User[]>> {
        return { ok: true, value: [activeUser] };
      },
      async getUser(): Promise<ProviderResult<User>> {
        return { ok: true, value: activeUser };
      },
      async suspendUser(): Promise<ProviderResult<User>> {
        return { ok: true, value: suspendedUser };
      },
      async resumeUser(): Promise<ProviderResult<User>> {
        return { ok: true, value: activeUser };
      },
      async readUserSnapshot(): Promise<ProviderResult<AuditEntry>> {
        return { ok: true, value: readAudit(suspendedUser) };
      },
    };

    const staleNoopProvider: IdentityProvider = {
      async listUsers(): Promise<ProviderResult<readonly User[]>> {
        return { ok: true, value: [activeUser] };
      },
      async getUser(): Promise<ProviderResult<User>> {
        return { ok: true, value: activeUser };
      },
      async suspendUser(): Promise<ProviderResult<User>> {
        // Reports success, but downstream snapshot remains active.
        return { ok: true, value: suspendedUser };
      },
      async resumeUser(): Promise<ProviderResult<User>> {
        return { ok: true, value: activeUser };
      },
      async readUserSnapshot(): Promise<ProviderResult<AuditEntry>> {
        return { ok: true, value: readAudit(activeUser) };
      },
    };

    const result = await executeAction({
      action: 'suspend',
      customer,
      userKey: 'u1',
      adapters: { m365: healthyProvider, google: staleNoopProvider },
      writeAudit: async () => undefined,
    });

    assert.equal(result.status, 207);
    assert.equal(result.chip, 'Inconsistent');
  });
});
