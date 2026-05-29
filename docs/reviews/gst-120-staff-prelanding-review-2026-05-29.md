# GST-120 Staff Engineer Pre-Landing Structural Review (2026-05-29)

## Scope reviewed
- `apps/api/src/cipp/store.ts`
- `apps/api/src/cipp/webhook.ts`
- `apps/api/src/functions/cippWebhook.ts`
- `apps/api/src/functions/cippWebhookWorker.ts`
- `packages/core/src/execute-action.ts`
- `apps/api/functions/actions/suspend.ts`
- Related tests in `apps/api/functions/actions/__tests__/suspend.test.ts` and `apps/api/test/cipp-sync.test.ts`

## Disposition
- **Fail (do not ship yet)**

## Structural findings

### 1) Lost-update race on mirror writes can revert customer state (High)
- Evidence: [`apps/api/src/cipp/store.ts`](/paperclip/instances/default/projects/a0ba1fbf-f607-4eb9-88e9-058504bcf0e2/c952fc1c-6b5e-4f0c-89b3-f31559102165/CIPP-GoogleExtension/apps/api/src/cipp/store.ts:580), [`apps/api/src/cipp/store.ts`](/paperclip/instances/default/projects/a0ba1fbf-f607-4eb9-88e9-058504bcf0e2/c952fc1c-6b5e-4f0c-89b3-f31559102165/CIPP-GoogleExtension/apps/api/src/cipp/store.ts:590), [`apps/api/src/cipp/store.ts`](/paperclip/instances/default/projects/a0ba1fbf-f607-4eb9-88e9-058504bcf0e2/c952fc1c-6b5e-4f0c-89b3-f31559102165/CIPP-GoogleExtension/apps/api/src/cipp/store.ts:640)
- Why this is unsafe:
  - `applyQueuedEvent` does read-then-check (`incomingVersion < existing.sourceVersion`) and then unconditional `upsertMirror(..., 'Replace')`.
  - Two workers can process events for the same customer concurrently and both pass the stale check against the same old snapshot.
  - The older event can write last and overwrite a newer version, violating monotonic `sourceVersion` invariant.
- Required fix:
  - Add compare-and-swap semantics for mirror row updates (ETag-based conditional update), or serialize per-customer processing; reject/mark stale when write precondition fails and re-read detects newer version.

### 2) Event status updates swallow all errors, causing silent stuck `processing` rows and liveness drift (Medium)
- Evidence: [`apps/api/src/cipp/store.ts`](/paperclip/instances/default/projects/a0ba1fbf-f607-4eb9-88e9-058504bcf0e2/c952fc1c-6b5e-4f0c-89b3-f31559102165/CIPP-GoogleExtension/apps/api/src/cipp/store.ts:643), [`apps/api/src/cipp/store.ts`](/paperclip/instances/default/projects/a0ba1fbf-f607-4eb9-88e9-058504bcf0e2/c952fc1c-6b5e-4f0c-89b3-f31559102165/CIPP-GoogleExtension/apps/api/src/cipp/store.ts:657)
- Why this is unsafe:
  - `updateEventStatus` catches and ignores all failures.
  - A transient/storage auth failure after claiming can leave events permanently `processing`; worker only drains `received`, so these are never retried.
  - This breaks queue liveness and observability; replay behavior becomes non-deterministic.
- Required fix:
  - Do not fully swallow errors. At minimum log + metric + bounded retry; ideally fail the worker tick so platform retry logic can re-run with backoff.

## Test coverage gaps (must add)
- No concurrency test proving monotonic mirror version under parallel `drainWebhookEvents` or parallel `applyWebhookEvent`.
- No failure-injection test for `updateEventStatus` to verify stuck `processing` rows are recovered or surfaced.

## Handoff
- Return to implementer for fixes above. Re-review required before Release Engineer handoff.
