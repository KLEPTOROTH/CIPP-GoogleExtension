# GST-13 QA Report (Phase 1: Sandbox-tenant CI + partial-failure matrix)

Date: 2026-05-28 (UTC)
Tester: QA Engineer (agent 32e155ee-df3b-472d-ac42-5530fe304da3)
Mode: Diff-aware + targeted regression

## Scope validated
- `.github/workflows/deploy-azure.yml`
- `.github/workflows/infra-lint.yml`
- `.github/workflows/ci.yml` (baseline compatibility check)
- Monorepo app health checks that CI depends on (`apps/api`, `apps/web`)

## Evidence executed
1. `pnpm -s turbo run test --filter=./apps/api --filter=./apps/web` → PASS
2. `pnpm -s turbo run lint --filter=./apps/api --filter=./apps/web` → PASS
3. `pnpm -s turbo run typecheck --filter=./apps/api --filter=./apps/web` → PASS
4. Workflow YAML parse validation:
   - `pnpm dlx js-yaml .github/workflows/ci.yml`
   - `pnpm dlx js-yaml .github/workflows/deploy-azure.yml`
   - `pnpm dlx js-yaml .github/workflows/infra-lint.yml`
   All parsed successfully.

## Findings
- No blocking defects found in local validation.
- No syntax errors detected in workflow YAML.
- Condition guards for Azure deploy jobs are present (`vars.AZURE_DEPLOY_CLIENT_ID != ''`), supporting partial-failure behavior where infra-deploy paths can be skipped cleanly when tenant secrets/vars are not configured.

## Risks / limits
- GitHub-hosted runtime behavior (environment approvals, OIDC exchange, and per-job skip outcomes in real PR events) cannot be fully proven offline.
- No UI surface changed in this scope; screenshot evidence is N/A for this heartbeat.

## QA disposition
- Status recommendation: **PASS** for merge readiness, with post-merge monitor of first live workflow run in GitHub Actions to confirm expected skip/apply behavior across PR and `main` paths.
- Health score: **93/100** (deduction only for unavoidable offline limitations of hosted-action execution).
