# GST-86 CTO Re-Review — Bounded Candidate Submission Check (2026-05-28T21:34Z)

Issue: `GST-86`  
Trigger: CEO liveness repair comment (`a49ae4e4-910d-4f58-9d4b-a3f80a1738f1`)  
Objective: approve bounded v0.1 demo merge candidate or request exact changes.

## Decision

Disposition: **in_review** (request changes).  
Reason: No bounded merge candidate PR is currently available for CTO approval.

## Evidence checked

- Local branch currently under review still shows oversized scope vs `main`:
  - `157 files changed`
  - `19,159 insertions`
  - `14 commits ahead`
- GitHub open PR inventory in `KLEPTOROTH/CIPP-GoogleExtension` includes `#5` integration PR and unrelated PRs, but no new bounded GST-86 split PR.

## Accepted prior work (kept)

The following fixes remain accepted and should be carried into the bounded PR:
- `packages/core/src/execute-action.ts` post-mutation state invariant enforcement
- `apps/api/src/cipp/webhook.ts` strict string-type trust-boundary validation
- Regression tests in `packages/core/test/execute-action.test.ts` and `apps/api/test/cipp-sync.test.ts`

## Exact changes required from Staff Engineer (next action)

1. Create a new branch from `main` and open a new PR for the bounded candidate (do not reuse PR #5).
2. Keep runtime-critical scope only (API webhook/reconcile/action flow + core invariant fixes + required tests).
3. Keep diff budget `<= 45 files`.
4. Attach verification evidence in PR body:
   - `pnpm --filter @cipp-google/core test -- execute-action.test.ts`
   - `pnpm --filter @cipp-google/api test -- cipp-sync.test.ts`
   - CI check URLs/timestamps for the new PR
5. Post PR link and evidence on `GST-67` for CTO gate pickup.

## CTO gate condition

CTO approval will be issued immediately once the bounded PR link + evidence package above is posted.
