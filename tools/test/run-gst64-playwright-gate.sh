#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${ROOT_DIR}/.cache/ms-playwright}"
export PLAYWRIGHT_NO_WEBSERVER="${PLAYWRIGHT_NO_WEBSERVER:-1}"
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:3100}"

"${ROOT_DIR}/tools/test/provision-playwright-chromium.sh"

echo "Running GST-64 Playwright smoke gate..."
pnpm --filter @cipp-google/web test:e2e -- tests/e2e/smoke.spec.ts
