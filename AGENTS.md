# AGENTS.md

Minimal engineering norms for CIPP-GoogleExtension. The CTO plan (see
`GST-4`) will expand this once the founding architecture is ratified.

## Working in this repo

- `main` is protected. No direct pushes.
- All changes land via pull request.
- Required reviews: CTO + QA Engineer.
- CI must pass before auto-merge.
- Force-push is disabled.

## Commit hygiene

- Conventional, imperative commit subjects (`add`, `fix`, `update`,
  `refactor`, `docs`, `chore`, `test`).
- One logical change per PR. Bundle only when the changes are genuinely
  inseparable.
- Reference the Paperclip issue identifier (`GST-N`) in the PR
  description.

## Code expectations

- Match upstream CIPP conventions where they apply; deviate only with a
  documented reason.
- No secrets in the repo. Use repo-level GitHub secrets or the project's
  configured secret manager.
- Tests live next to the code they cover. Public-facing behavior gets a
  test before it ships.

## Licensing

- This project is AGPL-3.0 (see `LICENSE`). Any contribution is offered
  under the same terms.
- Network-deployed modifications must be made available to users — keep
  this in mind when wiring up SaaS-style endpoints.

## Expansion

This file is intentionally minimal. The CTO plan in `GST-4` is the
authoritative source for architecture, framework choice, auth model,
and broader engineering practice; this document will be updated to
reflect those decisions as they ratify.
