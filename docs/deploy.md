# Deploy

How CIPP Google Extension reaches hosted environments.

## Cloudflare Pages demo

The public demo at `https://cipp-google-extension-demo.pages.dev` is a
Cloudflare Pages direct-upload project. It is not git-connected, so the
deploy workflow uploads `apps/web/out` explicitly.

Production for this project is the existing Pages branch `gst-68-demo`.
Deploying to `main` creates only a preview and does not update the apex
domain.

### GitHub Actions path

`.github/workflows/deploy-cloudflare-pages.yml` deploys the demo on pushes to
`main` that touch the web app, shared core package, or the deploy workflow. It
can also be started manually with `workflow_dispatch` from `main`.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN` — scoped token with Cloudflare Pages deploy access for
  `cipp-google-extension-demo`.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account that owns the Pages project.

The workflow stamps `SOURCE_COMMIT_SHA` and `SOURCE_TAG` during the static
build, verifies the expected exported routes exist, then runs:

```sh
wrangler pages deploy apps/web/out \
  --project-name=cipp-google-extension-demo \
  --branch=gst-68-demo
```

### Manual fallback

Use this only when the GitHub Actions path is unavailable. Run it from a clean
checkout of the commit intended for release:

```sh
pnpm install --frozen-lockfile

export SOURCE_COMMIT_SHA="$(git rev-parse HEAD)"
export SOURCE_TAG="$(git tag --points-at HEAD | sort -V | tail -n 1)"
if [ -z "$SOURCE_TAG" ]; then
  export SOURCE_TAG="untagged"
fi
export SOURCE_REPO_URL="https://github.com/KLEPTOROTH/CIPP-GoogleExtension"
export SOURCE_LICENSE="AGPL-3.0"

pnpm --filter @cipp-google/core build
pnpm --filter @cipp-google/web build

pnpm dlx wrangler@3 pages deploy apps/web/out \
  --project-name=cipp-google-extension-demo \
  --branch=gst-68-demo
```

After deploy, verify:

```sh
curl -fsS https://cipp-google-extension-demo.pages.dev/source
curl -fsS https://cipp-google-extension-demo.pages.dev/customers/acme/users
curl -fsS https://cipp-google-extension-demo.pages.dev/customers/acme/users/user-001
```

The Release Engineer owns this loop. Drift between the deployed page and the
source stamp is an incident.

## Azure

How CIPP Google Extension reaches Azure.

## TL;DR

- **GitHub Actions** owns the deploy pipeline. No human runs `az` against the production subscription.
- **OIDC federated identity** — no long-lived secrets in CI. The workflow exchanges its OIDC token for a credential on a user-assigned managed identity scoped to the target resource group.
- **`dev` deploys on every push to `main`.** PRs run a `what-if` (no apply) so reviewers can see the resource diff.
- **`prod` is manual approve.** The GitHub Environment `prod` is configured with required reviewers; `workflow_dispatch` with `inputs.environment=prod` is the only way to trigger it.

## One-time setup (subscription owner)

Per environment (`dev`, `prod`), in the Azure subscription that owns the resource group:

1. Create a resource group (e.g. `rg-cge-dev`, `rg-cge-prod`).
2. Create a user-assigned managed identity:
   ```
   az identity create -n cge-${env}-deploy -g <rg-name>
   ```
3. Add a federated credential bound to this repo + the matching GitHub Environment:
   ```
   az identity federated-credential create \
     --name github-cge-${env} \
     --identity-name cge-${env}-deploy \
     --resource-group <rg-name> \
     --issuer https://token.actions.githubusercontent.com \
     --subject 'repo:KLEPTOROTH/CIPP-GoogleExtension:environment:${env}' \
     --audience api://AzureADTokenExchange
   ```
4. Grant the identity `Contributor` on the resource group:
   ```
   az role assignment create \
     --assignee-object-id <identity-principalId> \
     --assignee-principal-type ServicePrincipal \
     --role Contributor \
     --scope $(az group show -n <rg-name> --query id -o tsv)
   ```
5. Set the GitHub Environment variables for that environment:
   - `AZURE_DEPLOY_CLIENT_ID` — `clientId` of the user-assigned identity.
   - `AZURE_TENANT_ID` — Azure AD tenant ID.
   - `AZURE_SUBSCRIPTION_ID` — subscription where the RG lives.
   - `AZURE_${env}_RG` (e.g. `AZURE_DEV_RG`) — resource group name.
6. Paste the identity's `principalId` into `infra/bicep/${env}.bicepparam` → `deployIdentityPrincipalId` and merge.

Until step 5 lands, every deploy-azure.yml job is skipped (green) via the `vars.AZURE_DEPLOY_CLIENT_ID != ''` guard. After step 6 the first deploy succeeds and creates the rest of the baseline.

## What the workflow does on each event

| Event                                               | Jobs                                 | Effect                                                                               |
| --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| PR touching `infra/**` or `apps/api/**`             | `what-if-dev`                        | Runs `az deployment group what-if` against dev. No apply.                            |
| Push to `main` touching `infra/**` or `apps/api/**` | `deploy-dev`                         | Applies Bicep to dev. Stamps `SOURCE_COMMIT_SHA` + `SOURCE_TAG` on the Function App. |
| `workflow_dispatch` with `environment=prod`         | `deploy-prod` (after manual approve) | Applies Bicep to prod. Same SHA/tag stamping.                                        |

## AGPL §13 — keeping `/source` honest

The deploy job stamps `SOURCE_COMMIT_SHA` and `SOURCE_TAG` on the Function App every release. The `/source` HTTP endpoint reads these env vars. If a deploy succeeds without the stamp step (e.g. someone bypasses the workflow), `/source` returns the static default `unknown` from Bicep — a visible signal something is off.

The Release Engineer is the named owner of this loop. Drift = incident.

## Where this can fail

- **`deployIdentityPrincipalId` is empty.** Bicep refuses to deploy. Trip-wire by design.
- **Federated credential subject mismatch.** OIDC login fails with `AADSTS70021`. The `--subject` must match `repo:OWNER/REPO:environment:NAME` exactly.
- **Workflow on a fork.** OIDC tokens issued to forks aren't bound to our identity. Workflow runs but login fails — by design.

## Where this lives in the plan

Phase 0 deliverable on [GST-8](/GST/issues/GST-8); part of the architecture in [GST-4 plan §2.1 + §9](/GST/issues/GST-4#document-plan). Future work: VNet-integrated Function App + private endpoints on Storage + Key Vault (Phase 2-ish, not in scope for v0.1).
