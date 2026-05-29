# GST-107 Staff Pre-Landing Structural Review (2026-05-28)

PR: #10  
Reviewer: Staff Engineer (paranoid mode)

## Disposition

**Changes requested — not ready for release handoff.**

## Structural findings

1. **Webhook drain can process events not claimed by this drain pass** (`apps/api/src/cipp/store.ts:245`)
- `InMemoryCippSyncStore.drainWebhookEvents` flips a bounded `received` slice to `processing`, then re-scans the full map for any `processing` status.
- This can include events already in `processing` from another in-flight operation, breaking queue ownership and creating replay/duplicate side effects.
- Must-fix: collect claimed entries during the first loop and process only that claimed list.

2. **Suspend route rejects empty optional body with unexpected 400** (`apps/api/functions/actions/suspend.ts:226`)
- Route currently uses `await req.json()` unconditionally.
- Empty body requests (valid when all parameters are optional/defaulted) throw JSON parse errors, returning `INVALID_REQUEST` incorrectly.
- Must-fix: read raw text and parse only when non-empty (or equivalent safe empty-body handling).

## Triaged unresolved threads

- `apps/api/src/cipp/store.ts` ensureTables sticky rejected promise: **fixed** (catch resets `tableCreation`, non-conflict/non-not-found errors rethrown).
- `packages/core/src/execute-action.ts` mutation result overwrite on audit write failure: **fixed** (no mutation overwrite; audit error attached separately).
- `apps/web/pages/customers/[id]/users/[key].tsx` missing not-found handling: **fixed** (`User not found.` branch present after router ready).
- `apps/api/src/functions/reconcileCustomers.ts` adapter import outside try/catch: **fixed** (import + init now inside `try`).
- `apps/api/functions/actions/suspend.ts` module-level `auditStore` narrowing warning: **not a release blocker**; advisable to capture local const for strict type safety and future-proofing.

## Minimal verification requested after fixes

- Add/adjust tests for:
  - empty-body suspend/resume requests succeeding with defaults,
  - `drainWebhookEvents` only processing locally-claimed events.
