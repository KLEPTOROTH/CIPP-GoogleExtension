# GST-64 QA Report — Playwright Gate for GST-12 PR #5

Date: 2026-05-28 (UTC)
Mode: Diff-aware targeted gate
QA Engineer: ARC Solutions (agent 32e155ee-df3b-472d-ac42-5530fe304da3)

## Scope

- `apps/web/test/gst12-failure-modes.test.ts`
- `apps/web/tests/e2e/smoke.spec.ts`
- `apps/web/playwright.config.ts`

## Commands run

1. `pnpm --filter @cipp-google/web test -- test/gst12-failure-modes.test.ts`
2. `PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm --filter @cipp-google/web test:e2e -- tests/e2e/smoke.spec.ts`
3. `pnpm exec playwright install chromium`

## Results

- Unit failure-mode suite: PASS (`3 passed, 0 failed`)
- Playwright smoke suite: NOT EXECUTED to assertion level due to environment blocker.

## Blockers

1. Playwright browser binary missing at runtime:
   - Error: `Executable doesn't exist at /paperclip/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`
2. Browser installation in this harness is incomplete/hanging:
   - Cache path `/paperclip/.cache/ms-playwright/chromium-1148/chrome-linux` exists but does not contain `chrome` or `headless_shell` executable.

## Evidence

- Failed e2e run artifact directory: `apps/web/test-results/`
- Local cache inspection: `/paperclip/.cache/ms-playwright/chromium-1148/chrome-linux`

## QA Disposition

- Gate status: BLOCKED (environment/tooling)
- Product signal: no GST-12 behavior regression detected in targeted unit failure-mode coverage.

## Unblock action

- Owner: CTO/infra maintainer for CI runner image
- Action: provide a runner with working Playwright browser install (or pre-baked browser binaries), then rerun command #2 unchanged.

## Resume validation (2026-05-28, later heartbeat)

- Re-ran smoke gate with managed webserver disabled:
  - `PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm --filter @cipp-google/web test:e2e -- tests/e2e/smoke.spec.ts`
- Result unchanged: all 5 tests fail at launch with missing executable:
  - `/paperclip/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`
- Conclusion: blocker is reproducible and environment-level (not flaky test behavior).

## CTO lock (2026-05-28)

### Decision

- GST-64 remains `BLOCKED` pending infra remediation.
- No product-code changes are authorized for GST-12 until the browser-runtime gate can execute assertions on Chromium.
- First-class dependency blocker: `GST-74` (Provision Chromium-ready Playwright runner for GST-64 QA gate), currently `in_progress`.

### System boundary and ownership

- Product/test code owner: Staff Engineer
- Runtime/browser provisioning owner: CTO/Infra maintainer
- QA gate execution owner after unblock: QA Engineer

### Unblock implementation contract

1. Infra provides one of:
   - Pre-baked Playwright Chromium binaries on runner image, or
   - Verified `pnpm exec playwright install chromium` completion in the execution environment.
2. Validation command (must run unchanged):
   - `PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm --filter @cipp-google/web test:e2e -- tests/e2e/smoke.spec.ts`
3. Pass criteria:
   - Browser launches successfully.
   - Smoke spec reaches assertion phase.
   - Failing tests, if any, are behavior-level defects (not launcher/runtime defects).

### Handoff after unblock

- QA attaches fresh smoke output and updates gate status.
- If smoke passes, route PR #5 to Staff Engineer for final review, then QA signoff for merge gate.

### Liveness repair note (2026-05-28)

- Per CEO direction, blocker tracking is now anchored to issue `GST-74` as the unblock owner path, not only narrative comments.
- GST-64 must not resume browser-gate execution until `GST-74` posts runner verification evidence.

## CTO resume after GST-74 completion (2026-05-28)

### Dependency status

- `GST-74` is complete; infra unblock deliverable exists via `.github/workflows/gst64-playwright-gate.yml`.
- GST-64 is now execution-ready for QA evidence collection.

### CTO validation of unblock implementation

- Runner target: `ubuntu-22.04`
- Browser provisioning step present: `pnpm exec playwright install --with-deps chromium`
- Smoke gate command matches locked contract exactly:
  - `PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm --filter @cipp-google/web test:e2e -- tests/e2e/smoke.spec.ts`
- Artifact upload path present for QA evidence:
  - `apps/web/playwright-report`
  - `apps/web/test-results`
  - `/tmp/gst64-web.log`

### QA execution checklist (handoff)

1. Trigger workflow `gst64-playwright-gate` on PR #5 head.
2. Attach run URL, conclusion, and artifact summary to GST-64.
3. If pass: set gate to PASS and route PR #5 to Staff Engineer final review, then QA signoff.
4. If fail: classify failure domain as one of:
   - Test behavior regression in GST-12 scope, or
   - Environment/runtime regression outside product behavior.
