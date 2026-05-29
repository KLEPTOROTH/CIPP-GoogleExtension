# GST-22 CEO Product Handoff

## What this feature is for

V0.1 must remove deployment-mode friction for users by making CIPP integration feel the same from the extension UX, whether a customer is on hosted ARC or self-hosted CIPP.

## 10-star direction to lock in now

1. Make “compatibility” explicit, not hidden: every integration call must return the same top-level schema and a capabilities fingerprint that explains what is available per deployment mode.
2. Make failure actionable: classify all upstream failures with retryability and user-safe next-step hints in the same error envelope.
3. Make parity measurable: every required operation must have a published hosted/self-hosted status (`full`, `partial`, `missing`) before release.

## Decision recommendation for GST-22

- **Proceed with Phase 0 architecture as planned** (ARC-facing /api surface + mode-aware adapter), with parity behavior as a contract contract.
- **Hosted-vs-self-hosted policy for v0.1:**
  - Support both modes in architecture, but expose capability flags so product behavior is always explainable.
  - Hard-gate rollout if any required endpoint is `missing` in hosted mode.
  - If only partial gaps exist, ship with explicit warnings and degrade gracefully per endpoint.

## Why this is the right scope

- Preserves user trust by guaranteeing stable extension-facing contracts.
- Keeps CTO execution risk bounded: one adapter mode switch, one test matrix, one observability model.
- Delays speculative webhook/inbound-heavy behavior until parity evidence is complete, keeping MVP clear and reliable.

## CTO handoff items

1. Consolidate the authoritative spike reference in a single linked artifact in GST-4 comments:
   - [docs/cipp-api-surface.md](/paperclip/instances/default/projects/a0ba1fbf-f607-4eb9-88e9-058504bcf0e2/c952fc1c-6b5e-4f0c-89b3-f31559102165/CIPP-GoogleExtension/docs/cipp-api-surface.md)
   - [docs/gst-22-rest-api-surface-and-parity-spike.md](/paperclip/instances/default/projects/a0ba1fbf-f607-4eb9-88e9-058504bcf0e2/c952fc1c-6b5e-4f0c-89b3-f31559102165/CIPP-GoogleExtension/docs/gst-22-rest-api-surface-and-parity-spike.md)
2. Add/confirm endpoint parity statuses (`full`/`partial`/`missing`) in the linked spike for every endpoint actually used by `adapter-cipp`.
3. Mark final v0.1 mode decision explicitly in GST-4 as either:
   - `PROCEED` with parity conditions, or
   - `HARD_CONSTRAIN` to self-hosted-first.
4. Unblock implementation once GST-4 contains the above approval and link.
