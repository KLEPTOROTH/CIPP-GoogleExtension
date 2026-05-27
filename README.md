# CIPP-GoogleExtension

A unified Google Workspace + Microsoft 365 front end for MSPs.

CIPP-GoogleExtension mirrors the design and workflows of the upstream
[CIPP](https://github.com/KelvinTegelaar/CIPP) project, and extends them so
managed service providers can administer both Google and Microsoft tenants
from a single pane of glass.

## Goal

One workflow, one audit trail, across two ecosystems. Where upstream CIPP
manages Microsoft 365 tenants, this project layers Google Workspace
management on top — so day-to-day MSP tasks (user lifecycle, license
assignment, offboarding, reporting) do not require switching tools.

## Status

Phase 0 scaffolding. Founding execution plan and architecture are
tracked in Paperclip (see issue `GST-4`). The monorepo, base CI, and
hello-world skeletons for `apps/web`, `apps/api`, and `packages/core`
are in. Real feature work begins in Phase 1.

## Bootstrap

Prereqs:

- Node 20 (pinned via `.nvmrc`).
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.12.3 --activate`).

Install and verify the full pipeline:

```bash
pnpm install
pnpm turbo run build lint typecheck test
```

Useful scoped commands:

- `pnpm --filter @cipp-google/web dev` — Next.js dev server.
- `pnpm --filter @cipp-google/api start` — Azure Functions local host
  (`func start` from the Azure Functions Core Tools).
- `pnpm format` / `pnpm format:check` — Prettier across the workspace.

## Repo layout

```
apps/
  api/    Azure Functions v4 (Node 20, TS) — currently a single
          HTTP-triggered /health function.
  web/    Next.js 14 (Pages Router, MUI v5, TS) — minimal landing page
          consuming @cipp-google/core.
packages/
  core/                       Shared TS package, the seam other code
                              extends.
  eslint-config-cipp-google/  Shared ESLint config (base / next / node
                              presets).
```

## Upstream attribution

This project is derived from and inspired by
[CIPP](https://github.com/KelvinTegelaar/CIPP) by Kelvin Tegelaar and the
CyberDrain contributors. See [NOTICE](./NOTICE) for full attribution.

## License

[AGPL-3.0](./LICENSE) — same as upstream CIPP. Network-deployed
modifications must be made available to users in accordance with the
license.

## Contributing

See [AGENTS.md](./AGENTS.md) for engineering norms. All changes land via
pull request; `main` is protected and requires CTO + QA approval plus
green CI before auto-merge.
