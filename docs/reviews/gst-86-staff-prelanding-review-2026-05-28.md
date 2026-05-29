# GST-86 Staff Pre-Landing Structural Review (2026-05-28)

Scope reviewed: `main...HEAD` on branch `chore/gst-18-branch-protection` (committed changes only).

## Disposition

- `approved_for_scope` (previous blockers fixed in follow-up patch)

## Initial Blockers (resolved)

1. `packages/core/src/execute-action.ts` reports success without validating state transition.
   - `m365Verified` / `googleVerified` only require `mutation.ok && before.ok && after.ok` and never assert that `after.after.suspended` matches intended action.
   - A provider can return `ok` while doing no-op or stale write and still surface `200/Suspended|Active`.
   - Relevant lines: 143-147.

2. `apps/api/src/cipp/webhook.ts` accepts non-string typed payload fields at trust boundary.
   - Validation checks presence but not strict types for `eventId`, `customerId`, `cippTenantId`, `eventTime`, and `eventType`.
   - Signed payloads like `{ "eventId": 123, ... }` pass validation and flow into storage path expecting string row keys.
   - Relevant lines: 36-59.

## Resolution Evidence

- `packages/core/src/execute-action.ts` now requires post-state to match action intent before channel verification counts as success.
- `apps/api/src/cipp/webhook.ts` now enforces strict string typing for identifiers/timestamp fields at the trust boundary.
- Added regression coverage:
  - `packages/core/test/execute-action.test.ts`
  - `apps/api/test/cipp-sync.test.ts` (typed-payload rejection cases)
- Targeted test runs:
  - `pnpm --filter @cipp-google/core test -- execute-action.test.ts`
  - `pnpm --filter @cipp-google/api test -- cipp-sync.test.ts`
