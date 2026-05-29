# GST-114 QA Final Validation Report (PR #10 bounded v0.1 demo)

- Date: 2026-05-28 (UTC)
- QA mode: Diff-aware targeted validation
- Scope commit: `bfc4acf388340b62a1455d6ed8fb939af49eaee6` (`refs/pull/10/merge`)
- Result: FAIL
- Health score: 35/100

## Scope verified

Changed files were reviewed from PR #10 merge diff, with validation focused on:

- Bounded demo suspend flow API/core changes
- Added/updated tests in `apps/api/test` and `packages/core/test`
- Added QA gate script in `tools/test/run-gst64-playwright-gate.sh`

## Findings

### 1) Blocker: Playwright gate script references a missing provisioning script

- Severity: Critical
- Evidence:
  - `tools/test/run-gst64-playwright-gate.sh` invokes `tools/test/provision-playwright-chromium.sh`.
  - In PR #10 merge commit, `tools/test/provision-playwright-chromium.sh` is absent.
- Repro:
  1. `git checkout bfc4acf388340b62a1455d6ed8fb939af49eaee6`
  2. `bash tools/test/run-gst64-playwright-gate.sh`
  3. Observe error: `No such file or directory` for provision script.
- Impact:
  - QA bounded demo gate cannot execute.
  - Release validation path is broken.

### 2) Blocker: Added tests import undeclared dependencies and fail immediately

- Severity: High
- Evidence:
  - `packages/core/test/execute-action.test.ts` imports `vitest`, but `packages/core/package.json` does not declare `vitest`.
  - `apps/api/test/cipp-store-factory.test.ts` imports `@azure/data-tables`, but `apps/api/package.json` does not declare it.
- Repro:
  1. `git checkout bfc4acf388340b62a1455d6ed8fb939af49eaee6`
  2. `pnpm install --frozen-lockfile --prod=false`
  3. `pnpm --filter @cipp-google/core exec tsx --test test/execute-action.test.ts`
  4. `pnpm --filter @cipp-google/api exec tsx --test test/cipp-store-factory.test.ts test/cipp-sync.test.ts`
  5. Observe `Cannot find module 'vitest'` and `Cannot find module '@azure/data-tables'`.
- Impact:
  - Test suite for shipped behavior cannot be used to validate correctness.
  - QA confidence on regressions is reduced.

## Environment notes

- Node in harness: `v24.16.0`
- Repo engine constraint: `>=20.0.0 <21`
- Engine mismatch was warning-only and not the direct cause of the blockers above.

## QA disposition

- Final status recommendation for GST-114: `blocked`
- Unblock owner: CTO
- Required unblock actions:
  1. Ensure `tools/test/provision-playwright-chromium.sh` is included where `run-gst64-playwright-gate.sh` depends on it, or update gate script to a valid path.
  2. Add/align missing test dependencies (`vitest`, `@azure/data-tables`) for the affected packages and refresh lockfile.
  3. Re-run bounded QA gate and attach passing evidence.

## Rerun after GST-116 completion (2026-05-28 UTC)

- Rerun scope commit: `5be00526b3f74fe1be497c68b1562e41c9810176` (`refs/pull/10/head`)
- Result: FAIL (still blocked)

### Verified fixed from prior run

- The previously missing files now exist on PR head:
  - `.github/workflows/gst64-playwright-gate.yml`
  - `tools/test/run-gst64-playwright-gate.sh`
  - `tools/test/provision-playwright-chromium.sh`

### New/remaining blockers

1. Critical: QA gate script cannot run because `playwright` CLI is unavailable
   - Repro:
     1. `git checkout 5be00526b3f74fe1be497c68b1562e41c9810176`
     2. `pnpm install --no-frozen-lockfile --prod=false`
     3. `bash tools/test/run-gst64-playwright-gate.sh`
     4. Observe `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "playwright" not found`
   - Impact: bounded demo QA gate still does not execute end-to-end.

2. High: lockfile/package manifest drift on PR head
   - Repro:
     1. `git checkout 5be00526b3f74fe1be497c68b1562e41c9810176`
     2. `pnpm install --frozen-lockfile --prod=false`
     3. Observe `ERR_PNPM_OUTDATED_LOCKFILE` due to `packages/core/package.json` (`vitest` spec) not reflected in lockfile.
   - Impact: CI-style reproducible install fails on frozen lockfile.

3. High: API tests still require undeclared dependency
   - Repro:
     1. `pnpm --filter @cipp-google/api exec tsx --test test/cipp-store-factory.test.ts test/cipp-sync.test.ts`
     2. Observe `Cannot find module '@azure/data-tables'`.
   - Impact: PR-scoped API test coverage remains non-runnable.

## CEO-requested immediate rerun (2026-05-28T23:58Z)

- Trigger: CEO comment `18f4269f-6757-41ed-aad8-adb9fa6da707` requesting immediate executable rerun.
- Rerun scope commit: `5be00526b3f74fe1be497c68b1562e41c9810176` (latest PR #10 head at rerun time).
- Result: FAIL (exact failing gates captured below).

### Exact remaining failing gates

1. Critical gate failure: Playwright gate cannot start browser provisioning
   - Command: `bash tools/test/run-gst64-playwright-gate.sh`
   - Failure: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "playwright" not found`
   - Consequence: bounded v0.1 demo QA gate remains non-executable.

2. High test-path failure: API validation test still missing runtime dependency
   - Command: `pnpm --filter @cipp-google/api exec tsx --test test/cipp-store-factory.test.ts`
   - Failure: `Cannot find module '@azure/data-tables'`
   - Consequence: PR-scoped API regression test remains non-runnable.

### Validation note

- `pnpm install --frozen-lockfile --prod=false` now succeeds on this commit in the QA harness.
