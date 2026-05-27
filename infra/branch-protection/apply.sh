#!/usr/bin/env bash
#
# Apply the §9 policy gate to `main` on KLEPTOROTH/CIPP-GoogleExtension.
#
# Policy (per GST-4 §9 / AGENTS.md):
#   - Required reviews: CTO + QA Engineer (via CODEOWNERS, 2 approvals).
#   - CI must pass before merge.
#   - Force-push disabled, branch deletion disabled.
#   - Auto-merge enabled at the repo level.
#
# Idempotent: re-running converges the configured state.
#
# Pre-flight:
#   - GitHub returns 403 on private free-plan repos for branch protection
#     and rulesets. Flip the repo public OR upgrade to GitHub Pro before
#     running. See docs/branch-protection.md.
#
# Requires: bash, curl, jq, and one of:
#   - GH_TOKEN
#   - GITHUB_TOKEN_CIPP_GOOGLE_EXTENSION
#
# Usage:
#   infra/branch-protection/apply.sh            # apply
#   DRY_RUN=1 infra/branch-protection/apply.sh  # print the payload, don't PUT

set -euo pipefail

REPO="${REPO:-KLEPTOROTH/CIPP-GoogleExtension}"
BRANCH="${BRANCH:-main}"
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN_CIPP_GOOGLE_EXTENSION:-}}"

if [[ -z "$TOKEN" ]]; then
  echo "error: GH_TOKEN or GITHUB_TOKEN_CIPP_GOOGLE_EXTENSION must be set" >&2
  exit 2
fi

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "error: $bin is required" >&2
    exit 2
  fi
done

api() {
  local method="$1" path="$2"
  shift 2
  curl -sS -X "$method" \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com${path}" "$@"
}

# --- Required CI status checks --------------------------------------------
#
# Names match the `name:` field on each job in .github/workflows/*.yml.
# Keep this list in sync when CI jobs are added, renamed, or removed.
REQUIRED_CHECKS=(
  "Lint + Typecheck + Test"
)

contexts_json=$(printf '%s\n' "${REQUIRED_CHECKS[@]}" | jq -R . | jq -s .)

# Branch protection payload — see:
# https://docs.github.com/rest/branches/branch-protection#update-branch-protection
payload=$(jq -n \
  --argjson contexts "$contexts_json" \
  '{
    required_status_checks: {
      strict: true,
      contexts: $contexts
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      required_approving_review_count: 2,
      require_last_push_approval: true
    },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
    lock_branch: false,
    allow_fork_syncing: false
  }')

echo "Repo:   $REPO"
echo "Branch: $BRANCH"
echo "Required status checks:"
printf '  - %s\n' "${REQUIRED_CHECKS[@]}"
echo

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN=1 — payload that would be PUT:"
  echo "$payload" | jq .
  exit 0
fi

# --- Pre-flight: confirm API access ---------------------------------------
preflight_status=$(curl -sS -o /tmp/bp_preflight.json -w "%{http_code}" \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/branches/${BRANCH}/protection")

if [[ "$preflight_status" == "403" ]]; then
  echo "error: GitHub returned 403 on branch protection." >&2
  echo "       This usually means the repo is private on a free plan." >&2
  echo "       Fix: flip the repo public OR upgrade to GitHub Pro." >&2
  echo "       See docs/branch-protection.md." >&2
  cat /tmp/bp_preflight.json >&2 || true
  exit 1
fi

# --- Apply branch protection ----------------------------------------------
echo "Applying branch protection to ${REPO}:${BRANCH}..."
http_status=$(curl -sS -o /tmp/bp_apply.json -w "%{http_code}" -X PUT \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${REPO}/branches/${BRANCH}/protection" \
  -d "$payload")

if [[ "$http_status" != "200" ]]; then
  echo "error: PUT branch protection returned $http_status" >&2
  cat /tmp/bp_apply.json >&2 || true
  exit 1
fi
echo "  branch protection applied (HTTP $http_status)"

# --- Enable auto-merge at the repo level ----------------------------------
echo "Enabling repo-level auto-merge..."
repo_payload='{"allow_auto_merge": true, "delete_branch_on_merge": true}'
http_status=$(curl -sS -o /tmp/bp_repo.json -w "%{http_code}" -X PATCH \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${REPO}" \
  -d "$repo_payload")

if [[ "$http_status" != "200" ]]; then
  echo "error: PATCH repo settings returned $http_status" >&2
  cat /tmp/bp_repo.json >&2 || true
  exit 1
fi
echo "  auto-merge enabled (HTTP $http_status)"

echo
echo "Done. Verify with: infra/branch-protection/verify.sh"
