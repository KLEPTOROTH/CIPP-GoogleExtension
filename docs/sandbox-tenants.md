# Sandbox tenants — viability check

Per [GST-4 plan §6 R9](/GST/issues/GST-4#document-plan): nightly sandbox CI needs real M365 and Google Workspace tenants. This document is the viability check the CEO asked for as part of [GST-8](/GST/issues/GST-8) Phase 0 — what we are using, who owns its renewal, and what triggers escalation to a paid sandbox.

## Status

| Sandbox | Plan | Status | Renewal cadence | Human owner |
|---|---|---|---|---|
| Microsoft 365 Developer Program | Free, 25 E5 user licenses | **Not yet provisioned.** Subscription required from the human Azure account owner before [GST-14](/GST/issues/GST-14) onboarding starts. | Auto-renews every 90 days **only** if the tenant has recorded developer activity (sign-ins, Graph calls). Inactive tenants expire. | Release Engineer (renewal) + QA Engineer (activity). |
| Google Workspace Cloud Identity Free | Free, ≥5 test users via Cloud Identity Free | **Not yet provisioned.** Cloud Identity Free signup required (one-time). | No expiry, but ≤50 users per organization. | Release Engineer (provisioning) + QA Engineer (test users). |

Status is **pre-Phase-1**: this issue (GST-8) documents the path. Provisioning the tenants themselves is a human action and is scheduled inside [GST-14](/GST/issues/GST-14) (M365) and [GST-10](/GST/issues/GST-10) (Google).

## M365 Developer Program — viability

### What it gives us

- A dedicated `*.onmicrosoft.com` tenant with Microsoft Graph access.
- 25 pre-licensed E5 users (Exchange Online, SharePoint, Teams, AAD P2).
- Activatable as a CSP customer for GDAP testing.

### Renewal mechanics (the R9 risk)

The tenant auto-renews every 90 days **only if** there is recorded developer activity within the previous renewal window:

- A signed-in user.
- A Microsoft Graph API call from a registered app.
- A Teams meeting, an Exchange mailbox interaction, etc.

If activity drops to zero, the tenant is suspended. After ~30 more days, it's deleted, and the GDAP relationships keyed to it die with it.

### Mitigations (built into the plan, not extra cost)

- **Nightly sandbox CI is itself activity.** A green nightly run logs a Graph call and a user-context sign-in; this satisfies the renewal heuristic.
- **Heartbeat scheduled task** — a `cron` GitHub Actions job pings the tenant every 7 days from a small read-only Graph script as a backup signal when nightly CI is red for an extended period.
- **Calendar reminder** — Release Engineer holds a recurring 60-day-out check on their calendar to manually confirm tenant health from the M365 admin portal.

### Escalation triggers (R9 promote-to-CTO conditions)

If any of the following hold by the start of Phase 1, Release Engineer must escalate to CTO **before** Phase 1 issues begin executing:

- The dev-program tenant cannot be provisioned at all (signup denied, region restriction, etc).
- The tenant was suspended in the last 90 days for inactivity.
- GDAP relationship cannot be established between our app and the dev-program tenant (some dev-program tenants have CSP restrictions).
- Microsoft has deprecated the program or moved it behind paid signup.

**Paid fallback:** an Azure subscription with a manually provisioned tenant + manually purchased E3/E5 licenses (~$22-$57/user/month). This is the funding ask if the free path is non-viable.

## Google Workspace Cloud Identity Free — viability

### What it gives us

- A managed organization with up to 50 user accounts.
- Access to Admin SDK Directory API + Reports API for the test users.
- Google domain (a real DNS-verified domain we control, e.g. `cge-sandbox.example`).

### Renewal mechanics

No expiry. Free tier persists indefinitely.

### Mitigations

- **DNS verification at signup** — the human owner sets up the domain at the moment of Cloud Identity signup. This is the only step that must happen out-of-band.
- **OAuth client setup is one-time** — once we register our app in the sandbox project, we don't need to redo it per CI run.

### Escalation triggers

- Google Workspace Cloud Identity Free has region restrictions in some jurisdictions; if we can't sign up from the operator's location, escalate.
- If we need Workspace-specific features beyond Cloud Identity (e.g. Drive, Gmail) for end-to-end testing, we need Google Workspace Business Starter (~$6/user/month). This is the funding ask if the free identity-only tier is non-viable for our test matrix.

## What is escalation, mechanically

Per the issue: "If either is flaky / non-viable for nightly CI: escalate to CTO **before Phase 1 starts** so paid sandbox can be funded."

Escalation path:

1. Release Engineer comments on this document's PR (or files a follow-up issue) with the specific failure mode and an estimate of paid-sandbox monthly cost.
2. CTO triages and brings the funding ask to CEO if needed.
3. Phase 1 issues are **held** until the funding decision is recorded — no point starting adapter implementation against a sandbox we don't trust.

The CEO has been clear ([GST-4 plan acceptance comment](/GST/issues/GST-4#comment-01eac116)) that paid sandbox is on the table as a reasonable expense, not a blocker.

## Open items handed to follow-up issues

- **Provision M365 Developer Program tenant** — owner: Release Engineer; tracked in [GST-14](/GST/issues/GST-14).
- **Provision Google Workspace Cloud Identity** — owner: Release Engineer; tracked in [GST-10](/GST/issues/GST-10).
- **Wire nightly CI activity into both tenants** — owner: QA Engineer; tracked in [GST-13 / sandbox-tenant CI](/GST/issues/GST-13) (when created).
- **Renewal heartbeat workflow** — owner: Release Engineer; create as a Phase 1 hardening issue if not already covered by sandbox CI.

If any of those are blocked or non-viable, the human-owner escalation in the Mitigations sections above kicks in.
