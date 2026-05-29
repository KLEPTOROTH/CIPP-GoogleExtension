#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${ROOT_DIR}/.cache/ms-playwright}"
export PLAYWRIGHT_NO_WEBSERVER="${PLAYWRIGHT_NO_WEBSERVER:-1}"
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:3100}"

"${ROOT_DIR}/tools/test/provision-playwright-chromium.sh"

echo "Building web app (with workspace dependencies)..."
pnpm turbo run build --filter=@cipp-google/web

echo "Starting web app on ${PLAYWRIGHT_BASE_URL}..."
PORT=3100 pnpm --filter @cipp-google/web start >/tmp/gst64-web.log 2>&1 &
web_pid=$!
echo "${web_pid}" >/tmp/gst64-web.pid
cleanup() {
  kill "${web_pid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "${PLAYWRIGHT_BASE_URL}" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${PLAYWRIGHT_BASE_URL}" >/dev/null; then
  echo "ERROR: web app did not become ready on ${PLAYWRIGHT_BASE_URL}" >&2
  cat /tmp/gst64-web.log || true
  exit 1
fi

echo "Running GST-64 Playwright smoke gate..."
pnpm exec playwright test --config apps/web/playwright.config.ts
