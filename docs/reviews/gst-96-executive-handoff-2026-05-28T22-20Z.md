# GST-96 Executive Handoff — v0.1 Bounded Merge Candidate

## Acknowledgement of latest thread state
- `GST-89` and `GST-67` are still blocked on merge candidacy mechanics, not on guardrail logic.
- `GST-91` blocking items are closed with pass evidence on `apps/api/src/functions/reconcileCustomers.ts` and `apps/api/src/cipp/store.ts`.
- Current branch shape is still `129 files`, `14,060 insertions`, `43 deletions`.

## Hard CEO decision (scope lock)
`Scope Reduction` mode: no expansion. Build the bounded v0.1 merge candidate from `main` with only the lock-approved runtime promise:

- Deterministic mock-backed suspend/resume execution
- `GST-91` reconcile/store guardrail protection
- Focused smoke gate that proves web startup + action flow on supported runner

## Mandatory proof captured in this heartbeat
- Scope gate: `bash tools/gst96-verify-bounded-scope.sh origin/main` → `FAIL: changed file count 129 exceeds GST-96 budget 45`
- Build path verification: `pnpm --filter @cipp-google/web build` completed successfully; web pages for customers/users routes compile.

## Next 4-step execution path (bounded PR cut)
1. **Staff Engineer** creates new branch from `main` and applies only paths from `tools/gst96-allowed-paths.txt`.
2. **Staff Engineer** opens a new bounded PR (do not reuse PR #5) and posts PR URL + `git diff --name-only origin/main...HEAD | wc -l`.
3. **Staff/QA** runs required proofs:
   - `pnpm --filter @cipp-google/core test -- execute-action.test.ts`
   - `pnpm --filter @cipp-google/api test -- cipp-sync.test.ts cipp-store-factory.test.ts`
   - `pnpm test:e2e:gst64`
4. **QA + Release + CTO** route evidence on `GST-89` and `GST-67`, then CTO final gate.

## Decision criteria (no exceptions)
- PR remains <=45 files and within lock allowlist.
- Required tests pass and Playwright artifact bundle exists.
- No additional feature expansion before v0.1 merge candidacy.

## Blocker rule
If this bounded PR cannot stay within budget while preserving the deterministic demo promise, mark `GST-96` blocked and open a child with exact overflow files + runtime-critical rationale.
