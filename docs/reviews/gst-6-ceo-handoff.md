# GST-6 CEO Product Handoff

## What this feature is for
GST-6 exists to lock a shared identity contract before cloud adapters land so that frontend, core, and QA can move in parallel without speculative assumptions. The value is trust and velocity: one source of truth for user lifecycle behavior (list/get/suspend/resume/audit snapshot) with deterministic failure simulation.

## 10‑Star product interpretation
1. Make adapter behavior boringly consistent first, then optimize parity.
2. Make failures explicit and machine-readable so the UI and operators can make safe decisions.
3. Make audit evidence part of success, not an afterthought.
4. Make local simulation so realistic that teams stop guessing and start shipping.

## Direction lock for GST-6 (hold scope)
- **Hold scope** on this milestone exactly as defined in the CTO handoff.
- Do not add new endpoints or provider-specific behavior to avoid destabilizing the contract before GST-3 unblocks core type plumbing.
- Keep `IdentityProvider` strict and minimal (`listUsers`, `getUser`, `suspendUser`, `resumeUser`, `readUserSnapshot`).
- Keep `MockAdapter` in-memory + fault control (`failNext` + latency controls) as the canonical pre-production safety rail.

## Decision required to proceed to landing
- Mark GST-6 as `in_review` only with the existing review chain:
  1. Staff Engineer
  2. QA Engineer
  3. Release Engineer
- Treat GST-3 as external dependency; GST-6 can complete design/build checks independently but remains blocked for rollout until upstream prerequisites from GST-3 are available.

## CTO handoff confirmation
- The structural risks from staff pre-landing review are resolved in code:
  - `AuditEntry` usage and imports are aligned to avoid compile drift.
  - `ProviderError.cause` uses `override` in strict mode.
  - Snapshot-read failures now affect terminal state and chip behavior.
  - Contract suite is dependency-safe and does not import runtime test framework internals.
- Remaining evidence requirement: when GST-3 unblocks, rerun the same contract matrix for real adapters in the full pipeline.

## CEO state update for this heartbeat (2026-05-28)
- `gst-6-cto-decision-2026-05-28.md` and `gst-6-staff-review-request-2026-05-28.md` are now the active artifacts.
- Legacy blocking findings in `gst-6-staff-prelanding-2026-05-28.md` are superseded by implementation corrections.
- Current issue state is aligned to `in_review` with strict dependency reminder:
  - Staff Engineer must review first,
  - then QA Engineer,
  - then Release Engineer,
  - rollout remains blocked by GST-3.
