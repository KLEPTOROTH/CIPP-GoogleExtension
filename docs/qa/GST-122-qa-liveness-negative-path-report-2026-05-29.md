# GST-122 QA Report (GST-119c liveness-policy regression and negative-path suite)

- Date (UTC): 2026-05-29
- QA mode: Diff-aware targeted regression
- QA owner: QA Engineer (ARC Solutions)
- Scope: Verify liveness-policy regression coverage and negative-path behavior with smallest high-signal suites.

## Targeted test execution

1. `pnpm --filter @cipp-google/web test -- test/gst12-failure-modes.test.ts`
- Result: PASS
- File/tests: 1 file, 3 tests

2. `pnpm --filter @cipp-google/api test -- test/cipp-sync.test.ts`
- Result: PASS
- File/tests: 1 file, 9 tests

3. `pnpm --filter @cipp-google/api test -- test/cipp-store-factory.test.ts`
- Result: PASS
- File/tests: 1 file, 2 tests

4. `pnpm --filter @cipp-google/api test -- functions/actions/__tests__/suspend.test.ts`
- Result: PASS
- File/tests: 1 file, 5 tests
- Note: Expected Azure Functions test-mode warnings emitted; no functional failures.

## Environment notes

- Node engine warning observed in all runs:
  - Project expects `node >=20.0.0 <21`
  - Harness runtime is `node v24.16.0`
- This warning did not affect test outcomes for the targeted suites.

## QA disposition

- Health score: 100/100 for targeted GST-122 scope.
- Bugs found: 0 in executed scope.
- Recommendation: QA pass for GST-122 scoped liveness/negative-path verification.

## Residual risk

- No browser E2E path was rerun in this heartbeat; this pass is focused on the requested liveness/negative-path regression suites.

## Acceptance traceability addendum (GST-119 section 7 policy codes)

Required explicit evidence targets from `docs/reviews/gst-119-cto-lock-2026-05-29.md`:
- `POLICY_CONTINUATION_REQUIRED`
- `POLICY_BLOCKER_INCOMPLETE`
- `POLICY_REVIEW_PATH_REQUIRED`
- `POLICY_CHILDREN_UNRESOLVED`

QA evidence check performed:
- `rg -n "POLICY_CONTINUATION_REQUIRED|POLICY_BLOCKER_INCOMPLETE|POLICY_REVIEW_PATH_REQUIRED|POLICY_CHILDREN_UNRESOLVED"`
- Result: matches found only in the CTO lock document, not in runnable test files.

Interpretation:
- The targeted suites executed in this heartbeat are green, but they do **not** provide explicit assertion-level proof for the four required policy rejection codes.
- Therefore, GST-122 objective acceptance is only partially satisfied.

QA blocker (first-class):
- Owner: CTO + Staff Engineer
- Action: add/point QA to the policy-engine negative-path tests asserting each required `POLICY_*` code and legal-transition success/concurrency cases, then re-route to QA for rerun.
- Scope: GST-119 liveness policy enforcement acceptance evidence.
