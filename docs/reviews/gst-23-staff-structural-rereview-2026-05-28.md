# GST-23 Staff Structural Re-Review (2026-05-28)

Disposition: **approve**
Issue: `GST-23` (Phase 1 / adapter-cipp read + webhook ingest + reconcile loop)
Reviewer: Staff Engineer

## Decision

Branch is structurally safe for pre-landing on GST-23 scope. The five prior request-change blockers are remediated with code and targeted tests.

## Blocker Closure

1. **Typed error mapping (closed)**

   - `packages/adapter-cipp/src/index.ts`
   - Non-404/429 HTTP now maps to `GenericProviderError(cipp_http_<status>)`.
   - Timeout/abort maps to `NetworkTimeoutError(cipp_request_timeout)`.
   - Non-timeout transport maps to `GenericProviderError(cipp_transport_error)`.
   - Invalid JSON/payload maps to `GenericProviderError(cipp_invalid_json|cipp_invalid_payload)`.

2. **Trust-boundary payload validation (closed)**

   - `packages/adapter-cipp/src/index.ts`
   - `listCustomers`/`listUsers` enforce array payload shape.
   - Customer/user mapping enforces required typed fields; malformed payloads are rejected, not fabricated.

3. **Reconcile delete drift healing (closed)**

   - `apps/api/src/cipp/store.ts`
   - `reconcileFromSnapshot` now unbinds local-only bound records not present in remote snapshot.

4. **Concurrent queue claim race (closed)**

   - `apps/api/src/cipp/store.ts`
   - Durable store introduces `claimEventForProcessing` with ETag-guarded status transition to `processing` before apply.

5. **Missing failure-mode coverage (closed for current scope)**
   - `packages/adapter-cipp/test/adapter-cipp.test.ts`
   - `apps/api/test/cipp-sync.test.ts`
   - Added tests for malformed payload rejection, non-timeout HTTP mapping, delete-drift reconcile behavior, and concurrent drain claim behavior.

## Verification Evidence

- `pnpm --filter @cipp-google/adapter-cipp test -- adapter-cipp.test.ts` → pass (4/4)
- `pnpm --filter @cipp-google/api test -- cipp-sync.test.ts` → pass (5/5)

## Residual Risk Notes

- Concurrency test currently validates in-memory claim semantics; durable Azure Table ETag path is covered by implementation logic but not by an integration harness in this issue scope.
- No additional pre-landing blockers for GST-23 acceptance criteria.

## Handoff

Proceed to **Release Engineer** for landing flow (PR final checks, required approvals, CI green, merge).
