# GST-134 Node20 Chromium Runner Provisioning

Date: 2026-05-29 (UTC)
Issue: GST-134
Target: PR #10 (`staff/gst-96-bounded-v0.1`)

## Runner contract

- GitHub Actions runner: `ubuntu-22.04`
- Node runtime: `20.x`
- Package manager: `pnpm@9.12.3`
- Browser cache: repo-local `.cache/ms-playwright`
- Chromium install: `PLAYWRIGHT_INSTALL_WITH_DEPS=1 bash tools/test/run-gst64-playwright-gate.sh`

The gate command now owns the full smoke lifecycle:

1. provision Playwright Chromium into the repo-local cache,
2. build `@cipp-google/web` with workspace dependencies,
3. start the web app on `127.0.0.1:3100`,
4. run `apps/web/tests/e2e/smoke.spec.ts`.

## Workflow setup

`.github/workflows/gst64-playwright-gate.yml` runs the same command on Node 20 and caches `.cache/ms-playwright` by OS and lockfile hash. The workflow sets `PLAYWRIGHT_INSTALL_WITH_DEPS=1` so the hosted Ubuntu runner installs the system dependencies required by Chromium.

## Local harness note

The current Paperclip local harness reports Debian 13 with Node 24, which is outside this repository's Node 20 engine contract and outside the supported runner contract for the GST-64 gate. Authoritative GST-134 evidence should come from the GitHub-hosted `gst64-playwright-gate` workflow on PR #10.
