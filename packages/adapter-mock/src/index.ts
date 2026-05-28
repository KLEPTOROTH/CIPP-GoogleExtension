import {
  type ProviderError,
  type ProviderErrorFactory,
  type IdentityProvider,
  type IdentityProviderMethod,
  type Customer,
  type AuditEntry,
  type ProviderResult,
  type User,
  NotFoundError,
} from '@cipp-google/core';

type UserKey = string;

interface MockAdapterOptions {
  initialUsers?: User[];
  latencyMs?: number;
}

interface CustomerState {
  users: Map<UserKey, User>;
  latestSnapshots: Map<UserKey, AuditEntry>;
}

const clock = () => new Date().toISOString();

const cloneUser = (user: User): User => ({
  ...user,
  m365: user.m365 ? { ...user.m365 } : undefined,
  google: user.google ? { ...user.google } : undefined,
});

const cloneAuditEntry = (snapshot: AuditEntry): AuditEntry => ({
  ...snapshot,
  before: cloneUser(snapshot.before),
  after: cloneUser(snapshot.after),
});

export class MockAdapter implements IdentityProvider {
  public latencyMs: number;
  private readonly failurePlan: Map<IdentityProviderMethod, ProviderErrorFactory> = new Map();
  private readonly stateByCustomer = new Map<string, CustomerState>();

  constructor(private readonly options: MockAdapterOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;
    this.seedUsers(options.initialUsers ?? []);
  }

  public failNext(side: IdentityProviderMethod, errorClass: ProviderErrorFactory): void {
    this.failurePlan.set(side, errorClass);
  }

  public setLatencyMs(latencyMs: number): void {
    this.latencyMs = latencyMs;
  }

  public async listUsers(customer: Customer): Promise<ProviderResult<readonly User[]>> {
    const failure = this.consumeFailure('listUsers');
    if (failure) {
      return { ok: false, error: failure };
    }

    await this.delay();
    const state = this.getState(customer.id);
    const users = [...state.users.values()].map(cloneUser);
    return { ok: true, value: users };
  }

  public async getUser(customer: Customer, key: UserKey): Promise<ProviderResult<User>> {
    const failure = this.consumeFailure('getUser');
    if (failure) {
      return { ok: false, error: failure };
    }

    await this.delay();
    const user = this.getUserRecord(customer.id, key);
    if (!user) {
      return { ok: false, error: new NotFoundError() };
    }

    return { ok: true, value: cloneUser(user) };
  }

  public async suspendUser(customer: Customer, key: UserKey): Promise<ProviderResult<User>> {
    const failure = this.consumeFailure('suspendUser');
    if (failure) {
      return { ok: false, error: failure };
    }

    await this.delay();
    const user = this.getUserRecord(customer.id, key);
    if (!user) {
      return { ok: false, error: new NotFoundError() };
    }

    const before = cloneUser(user);
    const after = { ...cloneUser(user), suspended: true, updatedAt: clock() };
    this.upsertUser(customer.id, key, after);
    this.recordSnapshot(customer.id, key, 'suspend', before, after);

    return { ok: true, value: cloneUser(after) };
  }

  public async resumeUser(customer: Customer, key: UserKey): Promise<ProviderResult<User>> {
    const failure = this.consumeFailure('resumeUser');
    if (failure) {
      return { ok: false, error: failure };
    }

    await this.delay();
    const user = this.getUserRecord(customer.id, key);
    if (!user) {
      return { ok: false, error: new NotFoundError() };
    }

    const before = cloneUser(user);
    const after = { ...cloneUser(user), suspended: false, updatedAt: clock() };
    this.upsertUser(customer.id, key, after);
    this.recordSnapshot(customer.id, key, 'resume', before, after);

    return { ok: true, value: cloneUser(after) };
  }

  public async readUserSnapshot(
    customer: Customer,
    key: UserKey,
  ): Promise<ProviderResult<AuditEntry>> {
    const failure = this.consumeFailure('readUserSnapshot');
    if (failure) {
      return { ok: false, error: failure };
    }

    await this.delay();
    const user = this.getUserRecord(customer.id, key);
    if (!user) {
      return { ok: false, error: new NotFoundError() };
    }

    const existingSnapshot = this.getLatestSnapshot(customer.id, key);
    if (existingSnapshot) {
      return { ok: true, value: cloneAuditEntry(existingSnapshot) };
    }

    const now = cloneUser(user);
    const freshSnapshot: AuditEntry = {
      customerId: customer.id,
      key,
      action: 'read',
      before: now,
      after: now,
      timestamp: clock(),
    };

    this.recordSnapshot(customer.id, key, 'read', freshSnapshot.before, freshSnapshot.after);
    return { ok: true, value: freshSnapshot };
  }

  private seedUsers(users: User[]): void {
    const groupedByCustomer = users.reduce<Record<string, User[]>>((acc, user) => {
      const existingUsers = acc[user.customerId] ?? [];
      existingUsers.push(user);
      acc[user.customerId] = existingUsers;
      return acc;
    }, {});

    Object.keys(groupedByCustomer).forEach((customerId) => {
      const state = this.stateByCustomer.get(customerId);
      if (!state) {
        this.stateByCustomer.set(customerId, { users: new Map(), latestSnapshots: new Map() });
      }
      groupedByCustomer[customerId]?.forEach((user) => {
        const record = cloneUser(user);
        this.stateByCustomer.get(customerId)!.users.set(user.id, record);
      });
    });
  }

  private getState(customerId: string): CustomerState {
    const existing = this.stateByCustomer.get(customerId);
    if (existing) {
      return existing;
    }

    const freshState = { users: new Map(), latestSnapshots: new Map() };
    this.stateByCustomer.set(customerId, freshState);
    return freshState;
  }

  private getUserRecord(customerId: string, key: string): User | null {
    return this.getState(customerId).users.get(key) ?? null;
  }

  private upsertUser(customerId: string, key: string, user: User): void {
    this.getState(customerId).users.set(key, cloneUser(user));
  }

  private getLatestSnapshot(customerId: string, key: string): AuditEntry | null {
    return this.getState(customerId).latestSnapshots.get(key) ?? null;
  }

  private recordSnapshot(
    customerId: string,
    key: string,
    action: AuditEntry['action'],
    before: User,
    after: User,
  ): void {
    this.getState(customerId).latestSnapshots.set(key, {
      customerId,
      key,
      action,
      before: cloneUser(before),
      after: cloneUser(after),
      timestamp: clock(),
    });
  }

  private consumeFailure(side: IdentityProviderMethod): ProviderError | undefined {
    const failureFactory = this.failurePlan.get(side);
    if (!failureFactory) {
      return undefined;
    }
    this.failurePlan.delete(side);
    return new failureFactory();
  }

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.latencyMs);
      });
    }
  }
}
