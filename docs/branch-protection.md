# Branch protection

`main` is the only long-lived branch. Everything else is a short-lived
PR branch. This document captures the §9 policy gate from `GST-4` and
the operational story for applying / re-applying it.

## Policy

Source: `GST-4` §9, restated in `AGENTS.md`.

- **Required reviews.** 2 approvals, with code-owner review required.
  `.github/CODEOWNERS` (when present) names the CTO and the QA Engineer
  as owners of `*`, so every PR needs both before merge.
- **CI must pass.** The `Lint + Typecheck + Test` job (from
  `.github/workflows/ci.yml`) is a required status check. Branches must
  be up-to-date with `main` before merge (`strict: true`).
- **Force-push disabled.** `allow_force_pushes: false`.
- **Branch deletion disabled.** `allow_deletions: false`.
- **Admin enforcement on.** `enforce_admins: true` — no one bypasses
  the gate, including the repo owner.
- **Linear history.** `required_linear_history: true` — squash or
  rebase merges only.
- **Stale reviews dismissed on new commits.** New pushes invalidate
  prior approvals (`dismiss_stale_reviews: true`,
  `require_last_push_approval: true`).
- **Conversation resolution required.** All review threads must be
  resolved before merge.
- **Auto-merge enabled at the repo level.** PRs can opt into
  auto-merge; GitHub will land them once reviews and required checks
  are satisfied.

## Why this is currently blocked

The GitHub REST endpoints we need both return 403 on a private
free-plan repo:

```
PUT /repos/KLEPTOROTH/CIPP-GoogleExtension/branches/main/protection
GET /repos/KLEPTOROTH/CIPP-GoogleExtension/rulesets
```

Response body:

> Upgrade to GitHub Pro or make this repository public to enable this
> feature.

This is a GitHub plan-level restriction, not something the Release
Engineer can work around with token scopes.

## Unblock paths

Either of the following clears the 403. The repo account holder
(KLEPTOROTH / project CEO) owns this decision.

1. **Flip the repo public.** The project is AGPL-3.0 already and the
   description treats it as source-available, so this is the cheapest
   unblock and aligns with the license.
2. **Upgrade the plan** to GitHub Pro (or Team / Enterprise) and keep
   the repo private.

Once either is done, the Release Engineer runs `apply.sh` and verifies.

## Applying the policy

Prerequisites:

- `GH_TOKEN` (or `GITHUB_TOKEN_CIPP_GOOGLE_EXTENSION`) in the environment
  with `repo` + `administration:write` scope on
  `KLEPTOROTH/CIPP-GoogleExtension`.
- `curl` and `jq` available.
- `.github/CODEOWNERS` populated with the CTO and QA Engineer GitHub
  handles (otherwise `require_code_owner_reviews` has nothing to
  enforce — approvals are still counted, but the code-owner gate is
  effectively a no-op).

```sh
# Inspect what would be applied (no API mutation).
DRY_RUN=1 infra/branch-protection/apply.sh

# Apply for real.
infra/branch-protection/apply.sh

# Confirm the live state matches the policy.
infra/branch-protection/verify.sh
```

Both scripts are idempotent: re-running converges the configured
state and exits cleanly when the policy is already satisfied.

## Updating the required checks list

`apply.sh` hard-codes the required status check names in the
`REQUIRED_CHECKS` array. When CI jobs are added, renamed, or removed
(see `.github/workflows/ci.yml`), update that array and re-run
`apply.sh`. The job's `name:` field is the contract — not the file
name and not the job ID.

## Out of scope

- The CI workflow itself — that lives in `.github/workflows/ci.yml`
  and is owned by `GST-5`.
- Rulesets (newer GitHub feature). The legacy branch-protection API is
  sufficient for the policy and works on every GitHub plan that
  supports it; rulesets would be an alternative implementation, not a
  required one.
