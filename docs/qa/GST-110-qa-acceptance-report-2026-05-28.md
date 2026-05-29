# GST-110 QA Acceptance Report (GST-8 / PR #4)

- Date (UTC): 2026-05-28
- QA mode: Diff-aware (PR-scoped)
- PR: `#4`
- Target head: `22fdcf58821fe7fea6c9145e2830dc424264f144`
- Scope validated:
  - Phase 0 Bicep skeleton
  - AGPL §13 `/source` plumbing
  - CIPP companion infra workflow baseline

## Verdict

PASS (with non-blocking warnings)

GST-8 can proceed to CTO final merge approval.

## Evidence

### 1) PR target validation

- `git cat-file -t 22fdcf58821fe7fea6c9145e2830dc424264f144` => `commit`
- `gh pr view 4` confirms:
  - `headRefOid`: `22fdcf58821fe7fea6c9145e2830dc424264f144`
  - PR state: `OPEN`
  - Merge state: `CLEAN`
  - Files changed include:
    - `.github/workflows/deploy-azure.yml`
    - `.github/workflows/infra-lint.yml`
    - `infra/bicep/main.bicep`
    - `infra/bicep/dev.bicepparam`
    - `infra/bicep/prod.bicepparam`
    - `apps/api/src/functions/source.ts`
    - `apps/api/test/source.test.ts`
    - phase-0 docs (`docs/agpl-source-availability.md`, `docs/deploy.md`, `docs/gdap-scopes.md`, `docs/sandbox-tenants.md`)

### 2) AGPL §13 endpoint test

Executed:

```bash
pnpm --filter @cipp-google/api test -- test/source.test.ts
```

Result:
- `1` test file passed
- `2` tests passed
- Endpoint registration warning is expected in Azure Functions test mode.

### 3) Infra lint/build parity check (same operations as CI workflow)

Executed:

```bash
bicep build infra/bicep/main.bicep --stdout > /dev/null
bicep lint infra/bicep/main.bicep
bicep build-params infra/bicep/dev.bicepparam --stdout > /dev/null
bicep build-params infra/bicep/prod.bicepparam --stdout > /dev/null
```

Result:
- All commands completed successfully (exit `0`).
- Observed warnings (non-blocking):
  - `infra/bicep/main.bicep:90` `BCP334` (possible short string path)
  - `infra/bicep/main.bicep:332` `BCP318` (`staticSite` nullability warning in output expression)

### 4) Workflow/guardrail checks

Verified in `deploy-azure.yml` at PR head:
- OIDC auth (`permissions.id-token: write`, `azure/login@v2`)
- Green-skip guard while bootstrap variables are unset: `vars.AZURE_DEPLOY_CLIENT_ID != ''`
- PR path triggers limited to infra + api + workflow file
- Deploy step stamps `SOURCE_COMMIT_SHA` and `SOURCE_TAG` into Function App settings
- `prod` deploy is `workflow_dispatch` + `environment: prod` (manual approval path)

Verified in `infra-lint.yml` at PR head:
- Triggered on Bicep changes
- Runs `bicep build`, `bicep lint`, and both param validations

## Findings

No blocking QA findings for GST-8 Phase 0 acceptance.

Non-blocking notes:
- Bicep warnings `BCP334` and `BCP318` are present and should be tracked for hardening, but did not fail build/lint in this phase.

