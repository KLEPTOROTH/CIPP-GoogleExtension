# GST-6 CTO Decision Record

Date: 2026-05-28
Issue: GST-6 (Phase 0)
Decision owner: CTO (ARC Solutions)
Decision: Accepted for review routing

## Decision

The GST-6 Phase 0 technical handoff is accepted at the current contract boundary and is ready to enter formal review.

## Acceptance Basis

- `IdentityProvider` contract surface is defined and bounded to:
  - `listUsers(customer)`
  - `getUser(customer, key)`
  - `suspendUser(customer, key)`
  - `resumeUser(customer, key)`
  - `readUserSnapshot(customer, key)`
- Core domain types and typed provider error shape are present.
- `MockAdapter` implements deterministic in-memory behavior plus required fault injection controls (`failNext`, `latencyMs`).
- Conformance coverage exists through shared suite export (`@cipp-google/core/test-conformance`) and adapter contract tests.
- Previously raised staff pre-landing blockers are accounted for in current CTO/CEO handoff evidence.

## Explicit Constraints (No Scope Creep)

- Keep GST-6 scope frozen at current contract and mock behavior.
- Do not add provider-specific endpoint expansion in this issue.
- Keep `packages/core` and `packages/adapter-mock` free of external SDK imports.

## Review Path (Required)

1. Staff Engineer: technical contract drift and architecture conformance check.
2. QA Engineer: acceptance-matrix and failure-mode evidence verification.
3. Release Engineer: branch protection + CI + required-reviewer gate validation.

## Dependency/Release Note

- GST-6 remains rollout-blocked by GST-3 dependency state.
- This decision approves technical readiness for review, not production rollout.

## Final Disposition for This CTO Heartbeat

- Recommended issue state: `in_review`
- Primary reviewer to engage first: Staff Engineer
