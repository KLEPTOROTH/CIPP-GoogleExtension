# `/source` — AGPL §13 source-availability endpoint

`GET /api/source` → JSON describing the running build's source.

```json
{
  "commitSha": "a60605b0eede545172f0ba17598e0b19928a79af",
  "tag": "v0.1.0",
  "repoUrl": "https://github.com/KLEPTOROTH/CIPP-GoogleExtension",
  "license": "AGPL-3.0"
}
```

## Why

AGPL-3.0 §13 requires that any user interacting with the program over a network can obtain its corresponding source. This endpoint is the canonical machine-readable answer — the frontend footer links to the GitHub tag matching `tag`, and falls back to the commit at `commitSha` when the build isn't tagged.

## Contract

Stable. The shape (`commitSha`, `tag`, `repoUrl`, `license`) is part of the public §13 obligation. Adding fields is fine; removing or renaming is a breaking change.

Read by:

- `apps/web/` footer (renders the link visibly on every page — landing with [GST-5](/GST/issues/GST-5) scaffolding).
- Operator dashboards / oncall scripts that need to know which build is live.

## Deploy ownership

Release Engineer keeps `SOURCE_COMMIT_SHA` and `SOURCE_TAG` accurate. The deploy workflow stamps both env vars on every push (`deploy-azure.yml` → `Stamp SOURCE_COMMIT_SHA + SOURCE_TAG`). Bicep defaults `SOURCE_COMMIT_SHA=unknown` and `SOURCE_TAG=unknown` so a deploy that bypasses the stamping step shows up immediately on the endpoint.

## Where this lives in the monorepo

This function ships in `apps/api/src/functions/`. The surrounding workspace plumbing
(`package.json`, `tsconfig.json`, `host.json`) lands with the monorepo scaffolding in
[GST-5](/GST/issues/GST-5). Until that lands, this file is the **contract** — when
scaffolding lands it picks up this source and the function compiles into the Azure Functions
v4 app.
