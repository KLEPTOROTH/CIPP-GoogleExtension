# GST-74 Runner Provisioning Evidence (Chromium Playwright)

Date: 2026-05-28 (UTC)
Issue: GST-74
Owner: CTO

## Change set
- Added deterministic Chromium provisioning script: `tools/test/provision-playwright-chromium.sh`
- Added GST-64 gate wrapper command script: `tools/test/run-gst64-playwright-gate.sh`
- Added root scripts:
  - `pnpm test:e2e:install`
  - `pnpm test:e2e:gst64`
- Updated bootstrap docs with QA gate commands in `README.md`

## Runner contract
- Browser cache is pinned to repo-local path via:
  - `PLAYWRIGHT_BROWSERS_PATH=$REPO/.cache/ms-playwright`
- Provisioning command:
  - `pnpm exec playwright install --force chromium`
- Verification rule:
  - resolve Chromium executable path from `@playwright/test` and assert executable bit.

## Verification on current harness
1. Baseline executable checks:
   - `/paperclip/.cache/ms-playwright/chromium-1148/chrome-linux/chrome` -> not executable
   - `/paperclip/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell` -> not executable
2. Bounded provisioning attempt:
   - `timeout 20 bash tools/test/provision-playwright-chromium.sh`
   - Result: `exit_code=124` (install hangs before executable verification)
3. Verbose diagnosis:
   - Host OS: Debian 13 (`trixie`) on Linux 6.12.
   - Playwright output explicitly reports unsupported OS and fallback bundle:
     - `BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu20.04-x64.`
   - Download completes (HTTP 200, full 161.3 MiB payload), then stalls during:
     - `pw:install extracting archive`
   - Reproduced with 45s and 240s bounded runs; both terminate with timeout `124`.

## Disposition
- Product-code side is now provisioned with a deterministic runner bootstrap contract.
- Environment remains infra-blocked in this harness due to Playwright Chromium install hang.

## QA resume command (unchanged contract)
```bash
PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm --filter @cipp-google/web test:e2e -- tests/e2e/smoke.spec.ts
```

## Recommended unblock owner/action
- Owner: Infra maintainer
- Action: provide a runner image on a Playwright-supported Linux distro (or pre-bake Chromium binaries) where `pnpm exec playwright install --force chromium` completes and yields executable Chromium binary under Playwright cache.

## Script hardening delivered
- `tools/test/provision-playwright-chromium.sh` now:
  - pins browser cache path repo-locally,
  - applies a bounded install timeout,
  - fails with an explicit infra-blocker message instead of silently stalling.

## CI runner path delivered
- Added workflow: `.github/workflows/gst64-playwright-gate.yml`
  - runner image: `ubuntu-22.04` (Playwright-supported base),
  - installs Chromium with deps: `pnpm exec playwright install --with-deps chromium`,
  - boots web app on `127.0.0.1:3100`,
  - runs the exact GST-64 gate command,
  - uploads Playwright and web-server logs as artifacts for QA.

This creates a deterministic QA execution path independent of the current Debian 13 local harness incompatibility.
