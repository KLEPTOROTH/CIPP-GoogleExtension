import { describe, expect, it } from 'vitest';

import { validateTransition } from '../src/cipp/issue-liveness-policy.js';

describe('issue liveness policy validator', () => {
  it('allows legal transition edges when required metadata is present', () => {
    expect(
      validateTransition('todo', 'in_progress', {
        continuation: { kind: 'running_child_issue', target: 'GST-999' },
      }),
    ).toEqual([]);

    expect(
      validateTransition('in_progress', 'in_review', {
        review: { reviewer: 'staff-engineer' },
      }),
    ).toEqual([]);

    expect(
      validateTransition('in_review', 'done', {
        requiredChildren: [
          { id: 'GST-101', state: 'closed' },
          { id: 'GST-102', state: 'closed' },
        ],
      }),
    ).toEqual([]);
  });

  it('rejects illegal edges with deterministic POLICY_INVALID_TRANSITION', () => {
    const violations = validateTransition('todo', 'done', {});
    expect(violations).toHaveLength(1);
    expect(violations[0]?.code).toBe('POLICY_INVALID_TRANSITION');
  });

  it('rejects in_progress without continuation path', () => {
    const violations = validateTransition('todo', 'in_progress', {});
    expect(violations.map((v) => v.code)).toContain('POLICY_CONTINUATION_REQUIRED');
  });

  it('rejects blocked without owner/action', () => {
    const violations = validateTransition('in_progress', 'blocked', {
      blocker: { owner: 'qa-engineer' },
    });
    expect(violations.map((v) => v.code)).toContain('POLICY_BLOCKER_INCOMPLETE');
  });

  it('rejects in_review without reviewer path', () => {
    const violations = validateTransition('in_progress', 'in_review', {});
    expect(violations.map((v) => v.code)).toContain('POLICY_REVIEW_PATH_REQUIRED');
  });

  it('rejects done while required child issue remains open', () => {
    const violations = validateTransition('in_review', 'done', {
      requiredChildren: [
        { id: 'GST-120', state: 'closed' },
        { id: 'GST-121', state: 'open' },
      ],
    });
    expect(violations.map((v) => v.code)).toContain('POLICY_CHILDREN_UNRESOLVED');
  });

  it('can surface transition and contract violations together for the same request', () => {
    const violations = validateTransition('blocked', 'done', {
      requiredChildren: [{ id: 'GST-121', state: 'open' }],
    });
    expect(violations.map((v) => v.code)).toEqual([
      'POLICY_INVALID_TRANSITION',
      'POLICY_CHILDREN_UNRESOLVED',
    ]);
  });

  it('holds deterministic results under concurrent legal/illegal transition checks', async () => {
    const requests = [
      () =>
        validateTransition('todo', 'in_progress', {
          continuation: { kind: 'running_child_issue', target: 'GST-123' },
        }),
      () => validateTransition('todo', 'in_progress', {}),
      () =>
        validateTransition('in_progress', 'blocked', {
          blocker: { owner: 'release-engineer', action: 'provision sandbox' },
        }),
      () => validateTransition('in_progress', 'blocked', {}),
      () =>
        validateTransition('in_progress', 'in_review', {
          review: { pullRequest: 'KLEPTOROTH/CIPP-GoogleExtension#101' },
        }),
      () => validateTransition('in_progress', 'in_review', {}),
      () =>
        validateTransition('in_review', 'done', {
          requiredChildren: [
            { id: 'GST-201', state: 'closed' },
            { id: 'GST-202', state: 'closed' },
          ],
        }),
      () =>
        validateTransition('in_review', 'done', {
          requiredChildren: [
            { id: 'GST-201', state: 'closed' },
            { id: 'GST-202', state: 'open' },
          ],
        }),
    ];

    const results = await Promise.all(requests.map(async (run) => run().map((v) => v.code)));
    expect(results).toEqual([
      [],
      ['POLICY_CONTINUATION_REQUIRED'],
      [],
      ['POLICY_BLOCKER_INCOMPLETE'],
      [],
      ['POLICY_REVIEW_PATH_REQUIRED'],
      [],
      ['POLICY_CHILDREN_UNRESOLVED'],
    ]);
  });
});
