# GST-94 Staff Re-Review — GST-91 Guardrail Fixes (2026-05-28)

## Scope reviewed

- Branch: `chore/gst-18-branch-protection`
- Diff base: `origin/main...HEAD`
- Guardrail focus from `GST-91` / `GST-89` lock:
  - `apps/api/src/functions/reconcileCustomers.ts`
  - `apps/api/src/cipp/store.ts`
  - `apps/api/test/cipp-sync.test.ts`
  - `apps/api/test/cipp-store-factory.test.ts`

## Structural findings

No ship-blocking structural defects found in the guarded scope.

### Guardrail 1: fail-closed reconcile on upstream read failure

- `reconcileCustomers` now throws on `adapter.listCustomers()` failure and aborts reconcile in the outer catch path.
- No conversion from failed fetch to authoritative empty snapshot remains.
- Regression coverage exists:
  - `apps/api/test/cipp-sync.test.ts` case: `does not mutate mirror when reconcile snapshot fetch fails`.

### Guardrail 2: no silent durable->memory downgrade in production-like config

- `createCippSyncStore` now throws on durable initialization failure unless explicit opt-in fallback is set via `CIPP_ALLOW_INMEMORY_FALLBACK=true`.
- Regression coverage exists:
  - throws when durable init fails and fallback flag is absent.
  - allows in-memory fallback only when flag is explicitly `true`.

## Targeted verification executed

Command:

```bash
pnpm --filter @cipp-google/api test -- cipp-sync.test.ts cipp-store-factory.test.ts
```

Result:

- 2 test files passed
- 10 tests passed
- Exit code: 0

## Decision

- Status: `approved`
- Release risk for previously blocked failure modes: mitigated
- Handoff: Release Engineer for bounded v0.1 demo PR ship path
