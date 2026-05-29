# GST-89 CTO Re-Review (2026-05-28T21:55Z)

Issue: `GST-89`  
Dependency child completed: `GST-91` (`done`)  
Scope: Verify closure of prior pre-landing blockers before Release handoff

## Decision

Status: **in_review** (CTO blocker gate reopened).  
Result: prior `changes_required` items are resolved for the two runtime safety blockers.

## Verification summary

### Blocker 1: Reconcile fail-open mass-unbind risk

- File reviewed: `apps/api/src/functions/reconcileCustomers.ts`
- Current behavior:
  - Upstream customer fetch failure now throws inside snapshot provider.
  - Reconcile execution is wrapped in `try/catch` and logs abort path.
  - No `[]` fallback is used for failed fetches.
- CTO verdict: **resolved**.

### Blocker 2: Silent durable-to-in-memory fallback in production-like runtime

- File reviewed: `apps/api/src/cipp/store.ts`
- Current behavior:
  - Durable initialization failures throw by default.
  - In-memory fallback only occurs when `CIPP_ALLOW_INMEMORY_FALLBACK=true`.
- CTO verdict: **resolved**.

### Regression coverage

- File reviewed: `apps/api/test/cipp-sync.test.ts`
  - Added fail-closed reconcile regression: snapshot fetch failure does not mutate bound row.
- File reviewed: `apps/api/test/cipp-store-factory.test.ts`
  - Added strict durable init failure throw test.
  - Added explicit opt-in fallback test.

Targeted command evidence captured in this heartbeat:

```bash
pnpm --filter @cipp-google/api test test/cipp-sync.test.ts test/cipp-store-factory.test.ts
# result: 2 test files passed, 10 tests passed
```

## Residual constraints

- This branch remains oversized for bounded v0.1 merge candidacy; that is tracked under the broader bounded PR scope in GST-89/GST-86 and is outside this specific blocker closure check.

## Handoff path

- **Release Engineer:** run bounded-candidate CI gate validation once Staff posts the bounded PR artifact and check statuses.
- **QA Engineer:** execute focused demo smoke on bounded candidate path and attach pass/fail evidence.
- **CTO:** final structural sign-off after Release + QA evidence lands on the bounded PR.
