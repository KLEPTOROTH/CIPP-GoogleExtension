# GST-89 Staff Pre-Landing Structural Review (2026-05-28)

## Scope reviewed

- Branch: `chore/gst-18-branch-protection`
- Diff base: `origin/main...HEAD`
- Commit reviewed: `83886dd`
- Focus: bounded v0.1 demo safety gates in runtime-critical paths
  - `apps/api/src/functions/reconcileCustomers.ts`
  - `apps/api/src/cipp/store.ts`
  - `packages/core/src/execute-action.ts`
  - webhook queue/reconcile tests

## Findings (ship blockers)

### 1) Critical: transient upstream read failure can unbind all customers

- File: `apps/api/src/functions/reconcileCustomers.ts:23`
- File: `apps/api/src/cipp/store.ts:528`

`reconcileCustomers` maps failed `adapter.listCustomers()` calls to `[]`, then `reconcileFromSnapshot([])` marks all bound local rows as `unbound`. This turns transient read outage/rate limit into destructive mirror drift.

Required fix:

- Fail closed on upstream read errors (abort reconcile with error/log, no destructive writes).
- Only allow full unbind semantics when the snapshot is explicitly authoritative.
- Add test coverage that failed snapshot fetch does not mutate mirror binding state.

### 2) High: durable-store init can silently downgrade to in-memory

- File: `apps/api/src/cipp/store.ts:755`

`createCippSyncStore()` catches durable-store construction/init failures and silently returns `InMemoryCippSyncStore`. In production this can pass smoke while dropping persistence/idempotency guarantees across restarts and scale-out workers.

Required fix:

- In production/runtime environments, fail fast when durable store is configured but not constructible.
- Keep in-memory fallback only under explicit dev/test opt-in flag.
- Add tests for misconfigured durable env to ensure startup fails (or explicitly follows dev-only fallback policy).

## Decision

- Status: `changes_required`
- Approval: not approved for release
- Handoff: return to implementer for fixes above, then rerun Staff pre-landing review before Release Engineer handoff.
