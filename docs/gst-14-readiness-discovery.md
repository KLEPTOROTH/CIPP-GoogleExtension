# GST-14 Readiness Discovery (2026-05-28)

## Status in current workspace

- `packages/adapter-cipp` is still not present.
- CIPP credential lifecycle endpoints are still absent from `apps/api/src` (`validate`, `connect`, `reconnect`, `disconnect`, `status`, `customers/import`).
- `CustomerMirror` model and persisted mirror import logic are not implemented.
- Health/source routes exist for API and AGPL compliance; `executeAction` and suspend action route are now present.

## What is present (and can be reused)

- `packages/adapter-m365` and `packages/adapter-google` implementations are present.
- `packages/core/src/execute-action.ts` supports two-provider partial-success semantics (`200/207/502`).
- `apps/api/functions/actions/suspend.ts` and matrix tests for action state mapping exist.
- Runbooks and API-surface docs for GST-14 were created in prior heartbeat.

## Immediate blockers to ship GST-14

1. Missing `packages/adapter-cipp` package and adapter contract surface.
2. Missing integration state storage and persistence primitives (`CIPPIntegrationState`, `CustomerMirror`).
3. Missing backend routes for connect/validate/reconnect/disconnect/import/status.
4. No explicit required-scope validation flow (no source of truth for required scopes + no scope probe endpoint usage).

## Unblocker decision required

- Owner: CTO + Staff Engineer
- Action required: deliver a dedicated GST-14 implementation branch/PR with the missing artifacts above before QA/Release can complete validation.

## Recommended first implementation slice (once unblocked)

- Add `packages/adapter-cipp` with:
  - health/capabilities probe
  - scope verification helper
  - deterministic customer list fetch + mapping keys
- Add `apps/api` integration endpoints and persistence adapters backed by existing Azure Storage table pattern.
- Add integration health aggregator and connect/reconnect mapping-preservation logic.

## Acceptance precondition

Proceed only when API route + adapter changes are available in-code; this issue remains `blocked` until then.

## Blocker normalization update (2026-05-28)

- CEO dependency cleanup confirmed GST-22 is complete.
- GST-14 now has one first-class blocker: GST-23 (`adapter-cipp` implementation/review).
- Release path remains unchanged: resume GST-14 release execution immediately after GST-23 lands with a code-bearing branch/PR.

## Liveness repair note (2026-05-28)

- Dependency liveness was explicitly repaired in issue thread governance.
- Active first-class blocker remains: `GST-23`.
- Release Engineering re-activates only when GST-23 review/merge clears and a shippable branch/PR is available.
