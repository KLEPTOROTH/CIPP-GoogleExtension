#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-origin/main}"
MAX_FILES="${GST96_MAX_FILES:-45}"
ALLOWLIST_FILE="tools/gst96-allowed-paths.txt"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "ERROR: base ref '$BASE_REF' not found."
  exit 2
fi

if [[ ! -f "$ALLOWLIST_FILE" ]]; then
  echo "ERROR: allowlist file missing: $ALLOWLIST_FILE"
  exit 2
fi

mapfile -t DIFF_FILES < <(git diff --name-only "$BASE_REF"...HEAD)
FILE_COUNT="${#DIFF_FILES[@]}"

if (( FILE_COUNT == 0 )); then
  echo "PASS: no diff vs $BASE_REF"
  exit 0
fi

if (( FILE_COUNT > MAX_FILES )); then
  echo "FAIL: changed file count $FILE_COUNT exceeds GST-96 budget $MAX_FILES"
  git diff --shortstat "$BASE_REF"...HEAD
  exit 1
fi

declare -A ALLOWED
while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  ALLOWED["$line"]=1
done < "$ALLOWLIST_FILE"

VIOLATIONS=()
for path in "${DIFF_FILES[@]}"; do
  if [[ -z "${ALLOWED[$path]+x}" ]]; then
    VIOLATIONS+=("$path")
  fi
done

if (( ${#VIOLATIONS[@]} > 0 )); then
  echo "FAIL: out-of-scope files detected vs GST-96 allowlist"
  printf ' - %s\n' "${VIOLATIONS[@]}"
  exit 1
fi

echo "PASS: GST-96 bounded scope validated"
echo "Changed files: $FILE_COUNT"
