#!/usr/bin/env bash
#
# Read the current branch protection on `main` and show whether it matches
# the §9 policy. Read-only — never mutates state.
#
# Exits 0 if the policy is satisfied, 1 otherwise.

set -euo pipefail

REPO="${REPO:-KLEPTOROTH/CIPP-GoogleExtension}"
BRANCH="${BRANCH:-main}"
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN_CIPP_GOOGLE_EXTENSION:-}}"

if [[ -z "$TOKEN" ]]; then
  echo "error: GH_TOKEN or GITHUB_TOKEN_CIPP_GOOGLE_EXTENSION must be set" >&2
  exit 2
fi

resp=$(curl -sS -w "\n%{http_code}" \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/branches/${BRANCH}/protection")

body=$(printf '%s' "$resp" | head -n -1)
status=$(printf '%s' "$resp" | tail -n 1)

if [[ "$status" != "200" ]]; then
  echo "Branch protection not readable (HTTP $status):" >&2
  echo "$body" >&2
  exit 1
fi

echo "Current branch protection on ${REPO}:${BRANCH}:"
echo "$body" | jq '{
  required_status_checks: .required_status_checks,
  required_pull_request_reviews: .required_pull_request_reviews,
  enforce_admins: .enforce_admins.enabled,
  required_linear_history: .required_linear_history.enabled,
  allow_force_pushes: .allow_force_pushes.enabled,
  allow_deletions: .allow_deletions.enabled,
  required_conversation_resolution: .required_conversation_resolution.enabled
}'

ok=1
fail() { echo "  FAIL: $*" >&2; ok=0; }

reviews=$(echo "$body" | jq '.required_pull_request_reviews.required_approving_review_count // 0')
[[ "$reviews" -ge 2 ]] || fail "required_approving_review_count=$reviews (want >= 2)"

co=$(echo "$body" | jq -r '.required_pull_request_reviews.require_code_owner_reviews // false')
[[ "$co" == "true" ]] || fail "require_code_owner_reviews=$co (want true)"

fp=$(echo "$body" | jq -r '.allow_force_pushes.enabled // false')
[[ "$fp" == "false" ]] || fail "allow_force_pushes=$fp (want false)"

del=$(echo "$body" | jq -r '.allow_deletions.enabled // false')
[[ "$del" == "false" ]] || fail "allow_deletions=$del (want false)"

ea=$(echo "$body" | jq -r '.enforce_admins.enabled // false')
[[ "$ea" == "true" ]] || fail "enforce_admins=$ea (want true)"

checks=$(echo "$body" | jq -r '.required_status_checks.contexts // [] | length')
[[ "$checks" -ge 1 ]] || fail "required_status_checks has $checks contexts (want >= 1)"

if [[ "$ok" -eq 1 ]]; then
  echo
  echo "OK — policy satisfied."
else
  exit 1
fi
