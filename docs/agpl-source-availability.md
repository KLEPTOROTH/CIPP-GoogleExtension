# AGPL §13 — Source availability plan

CIPP Google Extension is AGPL-3.0. §13 requires that any user interacting with the program over a network can obtain the running version's source. This document is the canonical statement of how we satisfy that obligation and who owns each piece.

## Surfaces

| Surface                                | What it does                                                                                                  | Owner                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `LICENSE`                              | Full AGPL-3.0 text.                                                                                           | Bootstrap ([GST-3](/GST/issues/GST-3)).                                                |
| `NOTICE`                               | Upstream attribution + license summary.                                                                       | Bootstrap ([GST-3](/GST/issues/GST-3)).                                                |
| `GET /api/source`                      | JSON manifest of the running build (`commitSha`, `tag`, `repoUrl`, `license`). Anonymous, cacheable for 60s.  | Release Engineer.                                                                      |
| Cloudflare Pages `/source`             | Static source page rendered from build-time `SOURCE_*` values because Pages export has no runtime API routes. | Release Engineer.                                                                      |
| Web footer (every page in `apps/web/`) | Human-readable "Source: GitHub @ `<tag>`" link, derived from `/api/source`.                                   | Release Engineer (contract) + scaffolding owner ([GST-5](/GST/issues/GST-5)) (render). |
| Public repo                            | Browsable code at the same tag/SHA the running build identifies.                                              | CEO/board (visibility flip), Release Engineer (tag accuracy).                          |

## Contract — `GET /api/source`

```http
GET /api/source HTTP/1.1
```

```json
{
  "commitSha": "string  — full 40-char Git SHA of the running build",
  "tag": "string  — most recent annotated tag, or 'untagged'",
  "repoUrl": "string  — canonical repo URL on GitHub",
  "license": "string  — SPDX identifier, currently 'AGPL-3.0'"
}
```

- `commitSha` MUST identify a commit reachable from the canonical repo's default branch (`main`).
- `tag` SHOULD point to a tag that contains `commitSha`. When the build was made off an untagged commit, `tag` is `untagged`.
- The endpoint MUST be reachable without authentication. §13 entitled users may not have credentials.
- Static export targets such as Cloudflare Pages do not ship Next API routes. For those targets, `/source` MUST render the same manifest from build-time `SOURCE_COMMIT_SHA`, `SOURCE_TAG`, `SOURCE_REPO_URL`, and `SOURCE_LICENSE`.

### Trip-wires

- `commitSha == "unknown"` — the deploy workflow did not stamp the env var. This is a visible alarm; the value is set by Bicep so the endpoint never 5xx's, but oncall sees `unknown` and treats it as an incident.
- `tag == "unknown"` — same.

## Web footer contract

Every page rendered by `apps/web/` MUST render a footer link of the form:

```
Source: <repoUrl>/tree/<tag> (commit <commitSha[0..7]>) — AGPL-3.0
```

If `tag == "untagged"` or `tag == "unknown"`, fall back to `<repoUrl>/commit/<commitSha>`. Link MUST be visible on every page; the CEO has called this out as required for the public-flip readiness gate ([GST-8](/GST/issues/GST-8) acceptance criteria).

The footer is implemented in [GST-5](/GST/issues/GST-5) scaffolding (lands a `<SourceFooter />` component consumed by the page layout). The contract is here so the implementation has a fixed target.

## Public-flip readiness

CEO has signed off on flipping the repo public on or before the first Phase 1 deploy ([GST-4 plan §6 R3](/GST/issues/GST-4#document-plan) + [acceptance comment](/GST/issues/GST-4#comment-01eac116)). When that happens:

1. Repo visibility flips on github.com.
2. Branch-protection rulesets are enabled (the deferred half of [GST-3](/GST/issues/GST-3#comment-2c3b818e-d587-4653-a6d4-cd62d8824108)).
3. Footer + `/source` are already live (this issue) — no scramble needed.

## Drift policy

Drift between `commitSha` (what `/source` returns) and the actual deployed image is an **incident**. Release Engineer is the named owner. Mitigations:

- Bicep default of `unknown` + deploy-workflow stamp step (this PR).
- Optional follow-up: a self-check Azure Function that fetches `/api/source` post-deploy and asserts the SHA matches `GITHUB_SHA` (out of scope for GST-8, tracked as a candidate item for the post-cutover hardening).
