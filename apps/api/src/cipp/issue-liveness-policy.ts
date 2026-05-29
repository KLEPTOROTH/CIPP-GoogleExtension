export type IssueStatus = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';

export type PolicyCode =
  | 'POLICY_INVALID_TRANSITION'
  | 'POLICY_CONTINUATION_REQUIRED'
  | 'POLICY_BLOCKER_INCOMPLETE'
  | 'POLICY_REVIEW_PATH_REQUIRED'
  | 'POLICY_CHILDREN_UNRESOLVED';

export interface LivenessMetadata {
  continuation?: {
    kind?: 'running_child_issue' | 'monitor' | 'review_wait' | 'human_input';
    target?: string;
  };
  blocker?: {
    owner?: string;
    action?: string;
  };
  review?: {
    reviewer?: string;
    pullRequest?: string;
    interactionId?: string;
  };
  requiredChildren?: Array<{ id: string; state: 'open' | 'closed' }>;
}

export interface PolicyViolation {
  code: PolicyCode;
  message: string;
}

const LEGAL_EDGES: Readonly<Record<IssueStatus, ReadonlySet<IssueStatus>>> = {
  todo: new Set<IssueStatus>(['in_progress', 'blocked']),
  in_progress: new Set<IssueStatus>(['in_progress', 'in_review', 'blocked', 'done']),
  in_review: new Set<IssueStatus>(['in_progress', 'blocked', 'done']),
  blocked: new Set<IssueStatus>(['in_progress', 'blocked']),
  done: new Set<IssueStatus>(['done']),
};

export function validateTransition(
  current: IssueStatus,
  requested: IssueStatus,
  metadata: LivenessMetadata = {},
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  if (!LEGAL_EDGES[current].has(requested)) {
    violations.push({
      code: 'POLICY_INVALID_TRANSITION',
      message: `illegal status transition from ${current} to ${requested}`,
    });
  }

  if (requested === 'in_progress') {
    if (!metadata.continuation?.kind || !metadata.continuation?.target) {
      violations.push({
        code: 'POLICY_CONTINUATION_REQUIRED',
        message: 'in_progress requires continuation.kind and continuation.target',
      });
    }
  }

  if (requested === 'blocked') {
    if (!metadata.blocker?.owner || !metadata.blocker?.action) {
      violations.push({
        code: 'POLICY_BLOCKER_INCOMPLETE',
        message: 'blocked requires blocker.owner and blocker.action',
      });
    }
  }

  if (requested === 'in_review') {
    const hasReviewPath =
      Boolean(metadata.review?.reviewer) ||
      Boolean(metadata.review?.pullRequest) ||
      Boolean(metadata.review?.interactionId);
    if (!hasReviewPath) {
      violations.push({
        code: 'POLICY_REVIEW_PATH_REQUIRED',
        message: 'in_review requires reviewer, pullRequest, or interactionId',
      });
    }
  }

  if (requested === 'done') {
    const unresolvedChildren = (metadata.requiredChildren ?? []).filter(
      (child) => child.state !== 'closed',
    );
    if (unresolvedChildren.length > 0) {
      violations.push({
        code: 'POLICY_CHILDREN_UNRESOLVED',
        message: 'done requires all required child issues to be closed',
      });
    }
  }

  return violations;
}
