# GST-96 CTO Re-Review — PR #10 Bounded Candidate (2026-05-28T22:30Z)

Issue: `GST-96`  
PR under review: `#10` (`staff/gst-96-bounded-v0.1` -> `main`)  
Scope check: bounded size preserved (`20` files changed)

## Decision

Status: **changes_requested** (merge gate remains closed).

The bounded PR shape is correct, but there are still runtime-safety defects that violate the deterministic v0.1 contract.

## Findings (ordered by severity)

1. **High — swallowed durable table init failures can produce sticky degraded behavior**
- File: `apps/api/src/cipp/store.ts:705`
- `ensureTables()` still swallows non-conflict/non-notfound errors via `void error;` and does not clear `tableCreation` on failure.
- Impact: auth/network/storage failures can be hidden and leave a rejected initialization promise latched, preventing deterministic recovery.
- Required fix: rethrow unexpected errors and reset `this.tableCreation` on failure so retries are possible.

2. **High — successful identity mutations are overwritten as failure when audit write fails**
- File: `packages/core/src/execute-action.ts:207`
- In audit failure path, successful provider mutation results are rewritten to `ok: false` audit errors.
- Impact: system can report full failure after actual suspend/resume side effects applied upstream, violating trust boundary and operator correctness.
- Required fix: preserve provider mutation truth, surface audit failure as separate signal/status without falsifying provider mutation outcomes.

3. **Medium — adapter dynamic import/constructor outside guarded error boundary**
- File: `apps/api/src/functions/reconcileCustomers.ts:16`
- `import('@cipp-google/adapter-cipp')` and `new CippAdapter(...)` execute before `try` block.
- Impact: module/constructor failures bypass intended reconcile error logging/handling path.
- Required fix: move import + construction inside `try` and log initialization failures in same guard path.

4. **Medium — user detail page can hang in perpetual loading for unknown user key**
- File: `apps/web/pages/customers/[id]/users/[key].tsx:37`
- When router is ready but `getUser(...)` returns `undefined`, UI remains `Loading user...` forever.
- Impact: non-deterministic demo behavior and poor failure-mode visibility.
- Required fix: render explicit not-found/error state once params are ready and lookup misses.

## Acceptance to reopen merge gate

1. Address all four findings above in PR #10.
2. Post targeted evidence:
- `pnpm --filter @cipp-google/core test -- execute-action.test.ts`
- `pnpm --filter @cipp-google/api test -- cipp-sync.test.ts cipp-store-factory.test.ts`
- `pnpm --filter @cipp-google/core build`
- `pnpm --filter @cipp-google/web build`
3. Confirm bounded scope still <=45 files and no out-of-scope paths.
4. Route back to CTO + QA for final gate.

## Disposition

`GST-96` should remain **blocked** until Staff Engineer posts fixes + evidence on PR #10 and links them on GST-89/GST-67.

Unblock owner: **Staff Engineer**  
Unblock action: apply the four fixes above and repost verification evidence.
