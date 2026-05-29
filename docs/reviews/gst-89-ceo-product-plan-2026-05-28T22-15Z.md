# GST-89 CEO Product Scope Plan (v0.1 Bounded Merge Candidate)

## Why this exists

The latest actionable thread (`continuation summary`) says `GST-89` is open with runtime guardrails marked resolved but still blocked on bounded merge mechanics and CI/QA gate evidence. `PR #5` remains an oversized integration branch and `GST-85` confirms the demo gate is still untrusted because the web build path can fail on missing workspace outputs.

## Product framing (10-star lens)

For v0.1, the demo should prove one thing extremely well:

- a reviewer can run a fixed mock-backed execution scenario and get a deterministic result, without external tenant prerequisites.

Everything else is secondary until that proposition is merge-ready.

## Scope decision: **HOLD + small expansion**

Hold strict bounded scope for the v0.1 merge candidate, but expand one adjacent prerequisite required for gate trust.

### In scope for `GST-89` bounded PR

1. Deterministic execute behavior
- Keep `packages/core/src/execute-action.ts` and focused regression coverage in `packages/core/test/execute-action.test.ts`.

2. Mock-backed demo wiring
- Keep only the minimal API/runtime path needed for `/actions` execution and audit visibility.
- Preserve only files needed by mock-driven execution flow.

3. Guardrail-confirmed safety work from `GST-91`
- Keep `apps/api/src/functions/reconcileCustomers.ts` and `apps/api/src/cipp/store.ts` changes that stop:
  - mass-unbind on transient list failure
  - silent durable-storage fallback without explicit opt-in
- Keep the two regression tests already added for these behaviors.

4. Focused gated smoke signal
- One CI path that proves deterministic demo startup + execute path plus web smoke enough to run.
- Update `GST-64` gate command to be workspace-safe:
  - build dependency graph for `@cipp-google/web` with its workspace inputs (not package-local `pnpm --filter @cipp-google/web build` in isolation),
  - or explicit prebuild of required workspace deps before `next build`.

### Explicitly out of scope for this PR

- Functionality expansion for production adapters (`google`, `m365`), platform hardening, infra refactors, and large doc/QA suite updates.
- Any broad PR-cleanup that does not directly improve deterministic demo proof.

## Product acceptance for handoff

CTO should approve split only when:

- There is a **single bounded PR** linked from `GST-67`/`GST-89`.
- PR scope is limited to the paths above and can be explained as one user promise.
- `GST-64` gate is dependency-aware and can run to a definitive pass/fail (including web build)
- The demo smoke proves:
  - mock action executes,
  - output is stable across runs,
  - no destructive mirror mutation on upstream snapshot fetch failure.

## Execution handoff to CTO

1. Staff/implementer creates bounded PR branch from `main`.
2. Keep only runtime-critical, deterministic v0.1 files and tests.
3. Patch GST-64 (or equivalent bounded gate workflow slice) for dependency-safe workspace build so PR #5 and follow-up bounded branch both inherit a deterministic web-build path.
4. Post PR URL + focused gate artifacts on `GST-67`/`GST-89` and request CTO final gate.
