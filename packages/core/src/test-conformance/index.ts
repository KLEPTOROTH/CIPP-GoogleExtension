import type { AuditEntry, Customer, User } from '../types.js';
import type { IdentityProvider } from '../identity-provider.js';

type ConformanceDescribe = (name: string, fn: () => void) => void;
type ConformanceTest = (name: string, fn: () => Promise<void> | void) => void;

export interface IdentityProviderConformanceHarness {
  describe: ConformanceDescribe;
  test: ConformanceTest;
}

export interface IdentityProviderConformanceFixture {
  customer: Customer;
  seedUsers: readonly User[];
}

export interface IdentityProviderConformanceOptions {
  fixture: IdentityProviderConformanceFixture;
  createAdapter: () => IdentityProvider | Promise<IdentityProvider>;
  harness: IdentityProviderConformanceHarness;
}

const assert = {
  deepEqual<T>(actual: T, expected: T): void {
    const actualString = JSON.stringify(actual);
    const expectedString = JSON.stringify(expected);
    if (actualString !== expectedString) {
      throw new Error(`assert.deepEqual failed: ${actualString} !== ${expectedString}`);
    }
  },
  equal<T>(actual: T, expected: T): void {
    if (actual !== expected) {
      throw new Error(
        `assert.equal failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
      );
    }
  },
  ok(value: unknown, message = 'assert.ok failed'): void {
    if (!value) {
      throw new Error(message);
    }
  },
};

function assertSuccess<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) {
    throw new Error(
      `expected success result, got error ${(result as { error?: Error }).error?.message}`,
    );
  }
  if (!result.value) {
    throw new Error('expected value in success result');
  }
  return result.value;
}

function assertFailure(result: { ok: boolean; error?: unknown }, code: string): void {
  if (result.ok) {
    throw new Error('expected failure result');
  }
  const error = result.error;
  assert.equal((error as { code?: string }).code, code);
}

function normalizeUsers(users: readonly User[]): User[] {
  return [...users].sort((a, b) => a.id.localeCompare(b.id));
}

export function runIdentityProviderContractSuite(
  options: IdentityProviderConformanceOptions,
): void {
  const { fixture } = options;
  const requiredUser = fixture.seedUsers[0];
  if (!requiredUser) {
    throw new Error('IdentityProvider contract fixtures must include at least one seeded user');
  }
  if (!options.harness || !options.harness.describe || !options.harness.test) {
    throw new Error('IdentityProvider contract suite requires an explicit test harness');
  }

  const { describe, test } = options.harness;

  describe('IdentityProvider contract suite', () => {
    test('lists seeded users', async () => {
      const adapter = await options.createAdapter();
      const result = await adapter.listUsers(fixture.customer);
      if (!result.ok) {
        throw new Error('listUsers must not fail for seeded users');
      }

      assert.deepEqual(normalizeUsers(result.value), normalizeUsers(fixture.seedUsers));
    });

    test('reads an existing user by key', async () => {
      const adapter = await options.createAdapter();
      const result = await adapter.getUser(fixture.customer, requiredUser.id);
      const user = assertSuccess(result);

      assert.equal(user.id, requiredUser.id);
      assert.equal(user.customerId, fixture.customer.id);
    });

    test('suspends and resumes users', async () => {
      const adapter = await options.createAdapter();

      const suspendedResult = await adapter.suspendUser(fixture.customer, requiredUser.id);
      const suspended = assertSuccess(suspendedResult);
      assert.equal(suspended.suspended, true);

      const suspendedSnapshot = await adapter.readUserSnapshot(fixture.customer, requiredUser.id);
      const snapshotAfterSuspend = assertSuccess(suspendedSnapshot);
      assert.equal(snapshotAfterSuspend.action, 'suspend');
      assert.equal(snapshotAfterSuspend.before.suspended, false);
      assert.equal(snapshotAfterSuspend.after.suspended, true);
      assert.equal(snapshotAfterSuspend.key, requiredUser.id);

      const resumedResult = await adapter.resumeUser(fixture.customer, requiredUser.id);
      const resumed = assertSuccess(resumedResult);
      assert.equal(resumed.suspended, false);

      const snapshotAfterResume = assertSuccess(
        await adapter.readUserSnapshot(fixture.customer, requiredUser.id),
      );
      assert.equal(snapshotAfterResume.action, 'resume');
      assert.equal(snapshotAfterResume.before.suspended, true);
      assert.equal(snapshotAfterResume.after.suspended, false);
    });

    test('supports read-only audit snapshot', async () => {
      const adapter = await options.createAdapter();
      const readResult = await adapter.readUserSnapshot(fixture.customer, requiredUser.id);
      const snapshot = assertSuccess(readResult);
      assert.equal(snapshot.action, 'read');
      assert.equal(snapshot.key, requiredUser.id);
      assert.deepEqual(snapshot.before, snapshot.after);
    });

    test('returns not_found for missing users', async () => {
      const adapter = await options.createAdapter();
      const key = '__does_not_exist__';
      const get = await adapter.getUser(fixture.customer, key);
      const suspend = await adapter.suspendUser(fixture.customer, key);
      const resume = await adapter.resumeUser(fixture.customer, key);
      const snapshot = await adapter.readUserSnapshot(fixture.customer, key);

      assertFailure(get, 'not_found');
      assertFailure(suspend, 'not_found');
      assertFailure(resume, 'not_found');
      assertFailure(snapshot, 'not_found');
    });
  });
}

export function makeAuditRecordAssertions(snapshot: AuditEntry): void {
  assert.ok(snapshot.timestamp.length > 0);
  assert.ok(snapshot.customerId);
  assert.ok(snapshot.key);
  assert.ok(snapshot.before);
  assert.ok(snapshot.after);
}
