#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Keep browser binaries in a repo-local cache to avoid cross-job corruption.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${ROOT_DIR}/.cache/ms-playwright}"

echo "Using PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH}"
mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"

echo "Installing Chromium browser bundle via Playwright..."
if command -v timeout >/dev/null 2>&1; then
  set +e
  timeout 600 pnpm exec playwright install --force chromium
  install_exit=$?
  set -e
  if [[ "${install_exit}" -eq 124 ]]; then
    echo "ERROR: Playwright install timed out after 600s (download/extract pipeline stalled)." >&2
    echo "Likely runner-image incompatibility (this host reports unsupported OS fallback in Playwright install logs)." >&2
    echo "Unblock: provide a Chromium-ready runner image or a supported OS runtime where install completes." >&2
    exit 124
  fi
  if [[ "${install_exit}" -ne 0 ]]; then
    echo "ERROR: Playwright install failed with exit code ${install_exit}." >&2
    exit "${install_exit}"
  fi
else
  pnpm exec playwright install --force chromium
fi

echo "Verifying Chromium executable path..."
executable_path="$(node -e 'const { chromium } = require("@playwright/test"); process.stdout.write(chromium.executablePath());')"

if [[ ! -x "${executable_path}" ]]; then
  echo "ERROR: Chromium executable is missing or not executable at ${executable_path}" >&2
  exit 1
fi

echo "Chromium is ready at ${executable_path}"
