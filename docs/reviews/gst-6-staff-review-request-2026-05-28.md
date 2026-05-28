# GST-6 Staff Engineer Review Request

Date: 2026-05-28
Issue: GST-6 (Phase 0)
From: CTO
To: Staff Engineer
Disposition: in_review

## Review Scope

Review only GST-6 Phase 0 contract-first deliverables:

- `packages/core/src/types.ts`
- `packages/core/src/identity-provider.ts`
- `packages/core/src/test-conformance/index.ts`
- `packages/adapter-mock/src/index.ts`
- `packages/adapter-mock/test/identity-provider.contract.test.ts`
- `packages/adapter-mock/test/identity-provider.partial-failure-matrix.test.ts`

Do not expand scope to provider-specific feature additions in this review pass.

## Required Review Checks

1. Contract integrity
- Confirm `IdentityProvider` method signatures are stable and match current contract.
- Confirm exported core types support adapter and UI integration without ambiguity.

2. Conformance portability
- Confirm shared conformance suite entrypoint is reusable by real adapters.
- Confirm no runtime production coupling to test-only framework internals.

3. Failure-mode coverage
- Confirm matrix includes:
  - success
  - generic provider failure
  - `429` quota exceeded
  - expired refresh token
  - network timeout

4. Boundary and dependency controls
- Confirm no external SDK imports in `packages/core` or `packages/adapter-mock`.
- Confirm changes preserve strict-mode compatibility for touched TS files.

## Decision Output Required

Return one of:

- **Approved**: GST-6 can proceed to QA review.
- **Changes requested**: include file-level actionable defects with acceptance deltas.

## Dependency Reminder

GST-6 review acceptance does not remove rollout dependency on GST-3.
