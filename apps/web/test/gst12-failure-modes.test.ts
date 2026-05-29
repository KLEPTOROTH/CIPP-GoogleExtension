import { describe, expect, it } from 'vitest';

import {
  getUser,
  performUnifiedAction,
  retryUserSide,
  getOverallStatus,
} from '../src/data/gst12Fixtures';

describe('gst12 failure-mode coverage', () => {
  it('partial fixture starts inconsistent and resolves via side retry', () => {
    const before = getUser('acme', 'user-003-partial');
    expect(before).toBeDefined();
    expect(getOverallStatus(before!)).toBe('Inconsistent');

    const retry = retryUserSide('acme', 'user-003-partial', 'google');
    expect(retry.error).toBeUndefined();
    expect(retry.outcome).toBe('success-both');
    expect(getOverallStatus(retry.user)).toBe('Suspended');

    expect(retry.user.m365Status).toBe('Suspended');
    expect(retry.user.googleStatus).toBe('Suspended');
  });

  it('rejects unified action while user is unresolved with typed failure code', () => {
    const result = performUnifiedAction('globex', 'user-g1', 'suspend');

    expect(result.outcome).toBe('failure-both');
    expect(result.error?.code).toBe('INVALID_USER_STATE');
    expect(result.error?.status).toBe(409);
  });

  it('returns typed machine-parseable retry failure for unknown dependent side', () => {
    const retry = retryUserSide('globex', 'user-g1', 'google');

    expect(retry.outcome).toBe('failure-both');
    expect(retry.error?.code).toBe('INCONSISTENT_RETRY_REQUIRED');
    expect(retry.error?.status).toBe(409);
    expect(retry.error?.requestId).toMatch(/^mock-/);
  });
});
