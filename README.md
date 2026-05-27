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

Bootstrap. Founding execution plan and architecture are tracked in
Paperclip (see issue `GST-4`). Code begins landing once the plan is
ratified.

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
