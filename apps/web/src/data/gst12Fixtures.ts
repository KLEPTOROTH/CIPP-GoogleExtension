export type BindingState = 'bound' | 'unbound' | 'unknown';
export type SuspensionState = 'Active' | 'Suspended' | 'Inconsistent' | 'Unknown';
export type ActionVerb = 'suspend' | 'resume';
export type ActionOutcome = 'success-both' | 'partial' | 'failure-both';
export type ActionErrorCode =
  | 'USER_NOT_FOUND'
  | 'INVALID_USER_STATE'
  | 'INCONSISTENT_RETRY_REQUIRED';

export interface ActionFailure {
  code: ActionErrorCode;
  message: string;
  requestId?: string;
  status?: number;
}

export interface CustomerSummary {
  id: string;
  name: string;
  m365BindingState: BindingState;
  googleBindingState: BindingState;
  lastConnectedAt: string;
}

export interface MergedUserRow {
  customerId: string;
  key: string;
  name: string;
  primaryEmail: string;
  m365Status: SuspensionState;
  googleStatus: SuspensionState;
  lastSignInM365?: string;
  lastSignInGoogle?: string;
  unmatchedOnM365: boolean;
  unmatchedOnGoogle: boolean;
  licenseInfo: string;
}

export interface UserAuditRow {
  id: string;
  timestamp: string;
  customerId: string;
  actor: string;
  target: string;
  targetType: 'user' | 'customer';
  action: ActionVerb;
  outcome: ActionOutcome;
  source: 'mock';
  reason?: string;
}

export interface ActionResult {
  user: MergedUserRow;
  outcome: ActionOutcome;
  error?: ActionFailure;
}

export interface ActionSide {
  actor: 'm365' | 'google';
}

const now = () => new Date().toISOString();
const toDate = (iso: string) => new Date(iso).toISOString();

function parseDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return toDate(value);
}

const customerSeed: CustomerSummary[] = [
  {
    id: 'acme',
    name: 'Acme Corp',
    m365BindingState: 'bound',
    googleBindingState: 'bound',
    lastConnectedAt: toDate('2026-05-01T00:00:00.000Z'),
  },
  {
    id: 'globex',
    name: 'Globex',
    m365BindingState: 'bound',
    googleBindingState: 'unbound',
    lastConnectedAt: toDate('2026-05-10T00:00:00.000Z'),
  },
];

const userSeeds: MergedUserRow[] = [
  {
    customerId: 'acme',
    key: 'user-001',
    name: 'Ari Miller',
    primaryEmail: 'ari.miller@acme.example',
    m365Status: 'Active',
    googleStatus: 'Active',
    lastSignInM365: toDate('2026-05-20T09:15:00.000Z'),
    lastSignInGoogle: toDate('2026-05-20T09:20:00.000Z'),
    unmatchedOnM365: false,
    unmatchedOnGoogle: false,
    licenseInfo: 'M365 E3 + Google Workspace Business',
  },
  {
    customerId: 'acme',
    key: 'user-002',
    name: 'Santiago Kline',
    primaryEmail: 'santiago.kline@acme.example',
    m365Status: 'Suspended',
    googleStatus: 'Suspended',
    lastSignInM365: toDate('2026-05-12T17:00:00.000Z'),
    lastSignInGoogle: toDate('2026-05-12T16:58:00.000Z'),
    unmatchedOnM365: false,
    unmatchedOnGoogle: false,
    licenseInfo: 'M365 Business Premium',
  },
  {
    customerId: 'acme',
    key: 'user-003-partial',
    name: 'Partial User',
    primaryEmail: 'partial.user@acme.example',
    m365Status: 'Suspended',
    googleStatus: 'Active',
    lastSignInM365: toDate('2026-05-18T08:40:00.000Z'),
    lastSignInGoogle: toDate('2026-05-18T08:42:00.000Z'),
    unmatchedOnM365: false,
    unmatchedOnGoogle: false,
    licenseInfo: 'M365 E5 + Google Workspace Basic',
  },
  {
    customerId: 'globex',
    key: 'user-g1',
    name: 'Google-Only User',
    primaryEmail: 'only.google@globex.example',
    m365Status: 'Unknown',
    googleStatus: 'Active',
    lastSignInGoogle: toDate('2026-05-15T11:30:00.000Z'),
    unmatchedOnM365: true,
    unmatchedOnGoogle: false,
    licenseInfo: 'Google Workspace Business',
  },
];

const auditSeed: UserAuditRow[] = [
  {
    id: 'audit-1',
    timestamp: toDate('2026-05-12T10:00:00.000Z'),
    customerId: 'acme',
    actor: 'system',
    target: 'user-001',
    targetType: 'user',
    action: 'suspend',
    outcome: 'success-both',
    source: 'mock',
    reason: 'initial baseline',
  },
];

const users = new Map<string, MergedUserRow>(
  userSeeds.map((user) => [`${user.customerId}::${user.key}`, { ...user }]),
);
const auditLog: UserAuditRow[] = [...auditSeed];

export function resetGst12Fixtures(): void {
  users.clear();
  for (const user of userSeeds) {
    users.set(key(user.customerId, user.key), { ...user });
  }
  auditLog.splice(0, auditLog.length, ...auditSeed);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function key(customerId: string, userKey: string): string {
  return `${customerId}::${userKey}`;
}

function deriveOverallStatus(row: MergedUserRow): SuspensionState {
  if (row.m365Status === 'Unknown' || row.googleStatus === 'Unknown') {
    return 'Unknown';
  }
  if (row.m365Status === 'Inconsistent' || row.googleStatus === 'Inconsistent') {
    return 'Inconsistent';
  }
  if (row.m365Status === 'Suspended' && row.googleStatus === 'Suspended') {
    return 'Suspended';
  }
  if (row.m365Status === 'Active' && row.googleStatus === 'Active') {
    return 'Active';
  }
  return 'Inconsistent';
}

function upsertRow(row: MergedUserRow): void {
  users.set(key(row.customerId, row.key), { ...row });
}

function appendAudit(event: Omit<UserAuditRow, 'id' | 'timestamp'> & { timestamp?: string }): void {
  auditLog.push({
    id: `audit-${auditLog.length + 1}`,
    timestamp: parseDate(event.timestamp) ?? now(),
    ...event,
  });
}

function applyActionValue(target: SuspensionState, action: ActionVerb): SuspensionState {
  return action === 'suspend' ? 'Suspended' : 'Active';
}

function makeFailure(code: ActionErrorCode, message: string, status = 500): ActionFailure {
  return {
    code,
    message,
    status,
    requestId: `mock-${Math.random().toString(36).slice(2, 10)}`,
  };
}

export function getCustomers(): CustomerSummary[] {
  return clone(customerSeed);
}

export function getMergedUsers(customerId: string): MergedUserRow[] {
  return clone(
    Array.from(users.values())
      .filter((row) => row.customerId === customerId)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}

export function getUser(customerId: string, userKey: string): MergedUserRow | undefined {
  const row = users.get(key(customerId, userKey));
  if (!row) {
    return undefined;
  }
  return clone(row);
}

export function performUnifiedAction(
  customerId: string,
  userKey: string,
  action: ActionVerb,
  actor = 'operator',
): ActionResult {
  const rowKey = key(customerId, userKey);
  const row = users.get(rowKey);

  if (!row) {
    return {
      user: {
        customerId,
        key: userKey,
        name: userKey,
        primaryEmail: `${userKey}@unknown.local`,
        m365Status: 'Unknown',
        googleStatus: 'Unknown',
        unmatchedOnM365: true,
        unmatchedOnGoogle: true,
        licenseInfo: 'N/A',
      },
      outcome: 'failure-both',
      error: makeFailure('USER_NOT_FOUND', `No merged row for ${userKey}`),
    };
  }

  const beforeStatus = deriveOverallStatus(row);
  if (beforeStatus === 'Inconsistent' || beforeStatus === 'Unknown') {
    appendAudit({
      customerId,
      actor,
      target: userKey,
      targetType: 'user',
      action,
      outcome: 'failure-both',
      source: 'mock',
      reason: 'Cannot perform unified action on unresolved states without retry',
      timestamp: now(),
    });
    return {
      user: { ...row },
      outcome: 'failure-both',
      error: makeFailure(
        'INVALID_USER_STATE',
        'Cannot perform unified action until side-specific retry completes.',
        409,
      ),
    };
  }

  const desiredStatus = applyActionValue(row.m365Status, action);

  if (userKey.endsWith('-partial')) {
    const nextRow = {
      ...row,
      m365Status: desiredStatus,
      googleStatus: row.googleStatus,
    };
    upsertRow(nextRow);
    appendAudit({
      customerId,
      actor,
      target: userKey,
      targetType: 'user',
      action,
      outcome: 'partial',
      source: 'mock',
      reason: 'm365 updated, google unchanged',
      timestamp: now(),
    });
    return { user: clone(nextRow), outcome: 'partial' };
  }

  const nextRow = {
    ...row,
    m365Status: desiredStatus,
    googleStatus: desiredStatus,
  };
  upsertRow(nextRow);
  appendAudit({
    customerId,
    actor,
    target: userKey,
    targetType: 'user',
    action,
    outcome: 'success-both',
    source: 'mock',
    reason: 'Both channels updated in lockstep',
    timestamp: now(),
  });

  return {
    user: clone(nextRow),
    outcome: 'success-both',
  };
}

export function retryUserSide(
  customerId: string,
  userKey: string,
  side: ActionSide['actor'],
  actor = 'operator',
): ActionResult {
  const rowKey = key(customerId, userKey);
  const row = users.get(rowKey);
  if (!row) {
    return {
      user: {
        customerId,
        key: userKey,
        name: userKey,
        primaryEmail: `${userKey}@unknown.local`,
        m365Status: 'Unknown',
        googleStatus: 'Unknown',
        unmatchedOnM365: true,
        unmatchedOnGoogle: true,
        licenseInfo: 'N/A',
      },
      outcome: 'failure-both',
      error: makeFailure('USER_NOT_FOUND', `No merged row for ${userKey}`),
    };
  }

  const targetStatus = side === 'm365' ? row.googleStatus : row.m365Status;
  if (targetStatus === 'Unknown' || targetStatus === 'Inconsistent') {
    return {
      user: { ...row },
      outcome: 'failure-both',
      error: makeFailure(
        'INCONSISTENT_RETRY_REQUIRED',
        `Cannot retry ${side} while dependent side is ${targetStatus.toLowerCase()}.`,
        409,
      ),
    };
  }

  const nextRow = { ...row };
  if (side === 'm365') {
    nextRow.m365Status = targetStatus;
  } else {
    nextRow.googleStatus = targetStatus;
  }

  upsertRow(nextRow);

  const outcome = deriveOverallStatus(nextRow) === 'Inconsistent' ? 'partial' : 'success-both';
  appendAudit({
    customerId,
    actor,
    target: userKey,
    targetType: 'user',
    action: targetStatus === 'Suspended' ? 'suspend' : 'resume',
    outcome,
    source: 'mock',
    reason: `Manual side retry for ${side}`,
    timestamp: now(),
  });

  return {
    user: clone(nextRow),
    outcome,
  };
}

export function getAuditLog(filter: {
  customerId?: string;
  actor?: string;
  target?: string;
  from?: string;
  to?: string;
  cursor?: number;
  limit?: number;
}): { rows: UserAuditRow[]; nextCursor?: number } {
  const limit = filter.limit ?? 25;
  let rows = [...auditLog].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (filter.customerId) {
    rows = rows.filter((entry) => entry.customerId === filter.customerId);
  }
  if (filter.actor) {
    const actorFilter = filter.actor.toLowerCase();
    rows = rows.filter((entry) => entry.actor.toLowerCase().includes(actorFilter));
  }
  if (filter.target) {
    const targetFilter = filter.target.toLowerCase();
    rows = rows.filter((entry) => entry.target.toLowerCase().includes(targetFilter));
  }
  if (filter.from) {
    rows = rows.filter((entry) => entry.timestamp >= filter.from!);
  }
  if (filter.to) {
    rows = rows.filter((entry) => entry.timestamp <= filter.to!);
  }

  const start = filter.cursor ?? 0;
  const slice = rows.slice(start, start + limit);
  const nextCursor = start + limit < rows.length ? start + limit : undefined;

  return {
    rows: clone(slice),
    nextCursor,
  };
}

export function getOverallStatus(row: MergedUserRow): SuspensionState {
  return deriveOverallStatus(row);
}
