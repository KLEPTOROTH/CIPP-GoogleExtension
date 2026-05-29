# GST-14 Readiness Discovery (2026-05-28)

## Status in current workspace

- `packages/adapter-cipp` is present after GST-23 merge.
- CIPP credential lifecycle endpoints are implemented in `apps/api/src/functions/cippIntegration.ts` (`validate`, `connect`, `reconnect`, `disconnect`, `status`, `customers/import`, `customers`).
- `CustomerMirror` import and idempotent reconciliation are backed by the GST-23 CIPP sync store.
- Admin setup surface is available at `/integrations/cipp`.
- Health/source routes exist for API and AGPL compliance; `executeAction` and suspend action route are now present.

## What is present (and can be reused)

- `packages/adapter-m365` and `packages/adapter-google` implementations are present.
- `packages/core/src/execute-action.ts` supports two-provider partial-success semantics (`200/207/502`).
- `apps/api/functions/actions/suspend.ts` and matrix tests for action state mapping exist.
- Runbooks and API-surface docs for GST-14 were created in prior heartbeat.

## Immediate blockers to ship GST-14

No first-class implementation blocker remains in this branch.

Remaining release gates are normal PR review and CI:
1. CTO review.
2. QA Engineer review.
3. Green CI.

## Release handoff

- Owner: Release Engineer
- Action required: keep the dedicated GST-14 branch scoped, verify focused API/web checks, and open the release PR for CTO + QA review.

## Implemented slice

- Uses `packages/adapter-cipp` customer listing as the required connectivity/scope probe.
- Adds `apps/api` integration endpoints with server-side credential-reference resolution.
- Stores only `secretRef` in integration state; API token bytes stay in runtime secrets.
- Uses existing `CustomerMirror` reconciliation so imports are idempotent and reconnect preserves mappings.

## Acceptance precondition

API route + adapter changes are now available in-code; proceed through review and CI.

## Blocker normalization update (2026-05-28)

- CEO dependency cleanup confirmed GST-22 is complete.
- GST-14 now has one first-class blocker: GST-23 (`adapter-cipp` implementation/review).
- Release path remains unchanged: resume GST-14 release execution immediately after GST-23 lands with a code-bearing branch/PR.

## Liveness repair note (2026-05-28)

- Dependency liveness was explicitly repaired in issue thread governance.
- Active first-class blocker remains: `GST-23`.
- GST-23 review/merge has cleared; Release Engineering re-activated on the GST-14 branch.
