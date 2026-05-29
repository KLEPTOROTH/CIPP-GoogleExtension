# GST-23 Staff Structural Review (2026-05-28)

Disposition: **request_changes**
Issue: `GST-23` (Phase 1 / adapter-cipp read + webhook ingest + reconcile loop)
Reviewer: Staff Engineer

## Decision

Do **not** ship this branch yet. Targeted tests pass, but structural production risks remain in adapter error semantics, trust-boundary validation, reconciliation completeness, and queue concurrency.

## Blocking Findings (must fix before release)

1. **High — Incorrect typed error mapping masks real failures and drives wrong retries**

   - File: `packages/adapter-cipp/src/index.ts`
   - Current behavior collapses non-404/429 HTTP failures, JSON parsing failures, and mapper failures into `NetworkTimeoutError`.
   - Required fix:
     - Distinguish timeout/abort from other transport failures.
     - Map non-timeout HTTP failures to non-timeout provider error type.
     - Treat parse/schema failures as contract errors, not timeout.

2. **High — Trust-boundary violation through silent fallback defaults**

   - File: `packages/adapter-cipp/src/index.ts`
   - Current behavior fabricates values (`unknown`, fallback email, empty array on non-array response) instead of rejecting malformed provider payloads.
   - Required fix:
     - Validate required shape/fields for customer and user DTOs.
     - Return typed failure when provider payload is malformed.

3. **High — Reconcile loop cannot heal missed delete/outbound drift**

   - Files: `apps/api/src/cipp/reconcile.ts`, `apps/api/src/cipp/store.ts`
   - Current behavior only upserts rows that exist in remote snapshot; it does not unbind/tombstone local records that no longer exist upstream.
   - Required fix:
     - Add negative-drift handling for local-only records according to source-of-truth semantics.

4. **Medium — Durable queue processing has a race window under concurrent workers**

   - File: `apps/api/src/cipp/store.ts`
   - Current behavior does read-status then apply then write-status without an atomic claim.
   - Required fix:
     - Add atomic claim/transition guard (ETag conditional update or equivalent lease strategy) before apply step.

5. **Medium — Test suite misses real failure modes**
   - Files: `packages/adapter-cipp/test/adapter-cipp.test.ts`, `apps/api/test/cipp-sync.test.ts`
   - Required additional coverage:
     - malformed payload schema rejection,
     - non-timeout HTTP failure mapping,
     - delete drift healing in reconcile,
     - durable-store concurrent dequeue/claim behavior.

## Verification Evidence

Executed targeted suites:

- `pnpm --filter @cipp-google/api test -- cipp-sync.test.ts`
- `pnpm --filter @cipp-google/adapter-cipp test`

Result: both suites pass; blocker risk remains due to missing structural coverage and the defects above.

## Handoff

Return to implementer for fixes above. Re-request Staff review after:

- all five findings are addressed,
- new tests are added for the listed failure modes,
- targeted suites pass with updated coverage.
