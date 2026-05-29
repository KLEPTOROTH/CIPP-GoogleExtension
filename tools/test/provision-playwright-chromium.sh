#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Keep browser binaries in a repo-local cache to avoid cross-job corruption.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${ROOT_DIR}/.cache/ms-playwright}"

echo "Using PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH}"
mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"

echo "Installing Chromium browser bundle via Playwright..."
INSTALL_TIMEOUT_SECONDS="${PLAYWRIGHT_INSTALL_TIMEOUT_SECONDS:-1800}"
DOWNLOAD_CONNECTION_TIMEOUT_MS="${PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT_MS:-120000}"
export PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT="${PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT:-${DOWNLOAD_CONNECTION_TIMEOUT_MS}}"
install_args=(install chromium)

if [[ "${PLAYWRIGHT_INSTALL_WITH_DEPS:-0}" == "1" ]]; then
  install_args=(install --with-deps chromium)
fi

if command -v timeout >/dev/null 2>&1; then
  install_exit=0
  for attempt in 1 2; do
    set +e
    timeout "${INSTALL_TIMEOUT_SECONDS}" pnpm --filter @cipp-google/web exec playwright "${install_args[@]}"
    install_exit=$?
    set -e
    if [[ "${install_exit}" -eq 0 ]]; then
      break
    fi
    if [[ "${attempt}" -lt 2 ]]; then
      echo "Playwright install attempt ${attempt} failed (exit ${install_exit}); retrying once..." >&2
      sleep 3
    fi
  done

  if [[ "${install_exit}" -eq 124 ]]; then
    echo "ERROR: Playwright install timed out after ${INSTALL_TIMEOUT_SECONDS}s (download/extract pipeline stalled)." >&2
    exit 124
  elif [[ "${install_exit}" -ne 0 ]]; then
    echo "ERROR: Playwright install failed with exit code ${install_exit}." >&2
    exit "${install_exit}"
  fi
else
  pnpm --filter @cipp-google/web exec playwright "${install_args[@]}"
fi

echo "Verifying Chromium executable path..."
executable_path="$(pnpm --filter @cipp-google/web exec node -e 'const { chromium } = require("@playwright/test"); process.stdout.write(chromium.executablePath());')"

if [[ ! -x "${executable_path}" ]]; then
  echo "ERROR: Chromium executable is missing or not executable at ${executable_path}" >&2
  exit 1
fi

echo "Chromium is ready at ${executable_path}"
