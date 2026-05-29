# GST-12 Pre-Landing Structural Review (2026-05-28)

Reviewer: Staff Engineer (paranoid mode)
Scope reviewed: working tree implementation for Phase 1 web/API/core (`/customers` flows, unified suspend, audit wiring intent)
Decision: **Not approved — return to implementer**

## Must-fix structural findings

1. **Critical: Phase-1 surfaces are not implemented at all in web app routes**

   - Evidence: `apps/web/pages/index.tsx` is still Phase-0 shell text; there are no route files for `/customers`, `/customers/:id/users`, `/customers/:id/users/:key`, or `/audit`.
   - Production impact: acceptance criteria cannot be met; no user-facing path to merged users, unified suspend, or audit table.
   - Required fix: implement the required pages/components and route data wiring before re-review.

2. **High: dry-run response uses HTTP 204 while returning a JSON body (protocol mismatch)**

   - Evidence: `apps/api/functions/actions/suspend.ts:93` returns status `204` with `jsonBody` payload.
   - Production impact: many clients/proxies drop 204 bodies by spec, so consumers may see empty responses while tests still pass against local object semantics.
   - Required fix: return `200` (or `202`) for payload-bearing dry-run responses, or keep `204` and remove body entirely.

3. **High: request body trust boundary is too permissive and silently accepts malformed JSON**

   - Evidence: `apps/api/functions/actions/suspend.ts:84-87` swallows JSON parse errors and continues with `{}`; `actorId` is accepted without validation/sanitization.
   - Production impact: malformed/hostile inputs bypass typed error contract, and actor attribution can be missing/garbled without explicit failure.
   - Required fix: reject invalid JSON with typed `400` error code; validate `actorId` shape/length/charset and emit machine-parseable validation errors.

4. **High: no concurrency/invariant protection for suspend/resume side effects**

   - Evidence: `packages/core/src/execute-action.ts` performs read-before/read-after around side-effecting calls but has no idempotency key, expected-version/etag guard, or retry conflict handling.
   - Production impact: concurrent suspend/resume requests can race and overwrite perceived final state; audit snapshots can reflect stale before/after invariants under contention.
   - Required fix: introduce mutation guardrails (idempotency key, optimistic concurrency token, or serialized per-user action lock) and add race-focused tests.

5. **Medium: tests pass while missing required failure mode verification for typed API errors and a11y flow**
   - Evidence: existing web/API tests cover smoke shell and action matrix, but do not assert:
     - typed machine-parseable error envelopes on API failures in UI,
     - keyboard navigation on unified suspend + audit table,
     - end-to-end partial failure UX with retry affordance on `Inconsistent` in actual pages.
   - Production impact: regressions in user-visible reliability and accessibility can ship undetected.
   - Required fix: add Playwright scenarios for keyboard and partial-failure/retry UX, plus API contract tests for error envelope shape.

## Handoff

Send back to implementer for the five fixes above, then request a fresh pre-landing structural review.
