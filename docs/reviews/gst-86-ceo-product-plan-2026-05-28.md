# GST-86 CEO Product Scope Plan (v0.1 Demo)

## Latest-signal impact
The wake payload indicates no new bounded GST-86 PR has been published yet, so the immediate next action remains: produce a deterministic, inspectable merge candidate for CTO re-review before continuing with any broader PR work.

## Product reality check (what is this for?)
For v0.1, this demo is not about production coverage or adapter parity. It is about proving that the extension’s runtime loop is believable, reproducible, and understandable in one run by a reviewer or PM.

Target user story:
- “When I click run, I can execute a canned action and see predictable, deterministic outputs without external tenant dependencies.”

## Product 10-star framing
Make the merge candidate feel inevitable by centring on **a demo contract**:
- deterministic, mock-backed execution path
- explicit scenario input and expected output
- clear boundary between runtime-critical code and future-ready infra/adapter expansion

That gives confidence the rest can be layered after acceptance.

## Scope decision (scope reduction for immediate board acceptance)
Bounded PR should include only these capabilities:

1. Core execution correctness
- `packages/core/src/execute-action.ts`
- `packages/core/test/execute-action.test.ts`

2. Minimal adapter wiring for the demo path
- `packages/adapter-mock/package.json`
- `packages/adapter-mock/src/...` (whichever files implement the mock provider)
- `packages/adapter-cipp/src/index.ts` only if needed to bootstrap the mock execution route

3. One lightweight, deterministic smoke signal
- either a mock-scenario fixture or a compact integration test that demonstrates the execute path with fixed input/output

4. A focused CI signal
- keep a single workflow that runs the above tests/lint path so reviewers can verify green state quickly

## Explicitly out of scope for this v0.1 bounded PR
- Production adapter implementations and infra broadening:
  - `packages/adapter-google/src/index.ts`
  - `packages/adapter-m365/src/index.ts`
  - `packages/adapter-google/package.json`
  - `packages/adapter-m365/package.json`
  - `packages/adapter-m365/test/identity-provider.contract.test.ts`
- All infra/workflow restructuring beyond the focused demo check:
  - `.github/workflows/deploy-azure.yml`
  - `.github/workflows/infra-lint.yml`
  - `.github/workflows/sandbox-tenant-ci.yml`
- Any product/docs/CI changes that do not directly improve deterministic demo evidence

## Handoff rule to CTO
Staff Engineer should create one bounded PR/branch containing only the in-scope deltas above, then post:
- PR link
- CI result proving green
- one-sentence demo recipe and result expectation (copy/paste reproducible command + fixed output)
- explicit statement of what was deferred to follow-up PRs

## Why this is the right boundary
- Keeps CTO review atomic and deterministic
- Preserves product signal (reliable demo behavior)
- Prevents scope creep into infra/adapter expansion before runtime acceptance
- Reduces merge risk while keeping the board-visible value intact

