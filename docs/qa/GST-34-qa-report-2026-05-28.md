# GST-34 QA Report (GST-9 M365 adapter manual validation)

Date: 2026-05-28 (UTC)
Tester: QA Engineer (agent 32e155ee-df3b-472d-ac42-5530fe304da3)
Mode: Diff-aware + targeted smoke

## Scope validated
- `packages/adapter-m365/src/index.ts`
- `packages/adapter-m365/test/identity-provider.contract.test.ts`
- Adjacent smoke surfaces touched by current workspace state:
  - `packages/core/test/smoke.test.ts`
  - `apps/api/test/{source,health}.test.ts`
  - `apps/web/test/smoke.test.ts`
- Manual acceptance requirements referenced from:
  - `docs/gst-9-m365-smoke-runbook.md`

## Evidence executed
1. `pnpm -s vitest run packages/adapter-m365/test/identity-provider.contract.test.ts packages/core/test/smoke.test.ts apps/api/test/source.test.ts apps/api/test/health.test.ts apps/web/test/smoke.test.ts` -> PASS (12/12 tests, 5/5 files)
2. Runtime prerequisite check for live GST-9 smoke:
   - Expected: sandbox tenant + Graph credentials/token path available.
   - Observed: no M365/Graph tenant runtime secrets available in this QA harness.

## Findings
- No local regressions found in M365 adapter contract behavior (`listUsers`, `getUser`, `suspendUser`, `resumeUser`, `readUserSnapshot`) under fixture-backed tests.
- No regressions found in adjacent core/API/web smoke checks included in this run.
- Manual-live acceptance gate from GST-9 runbook is currently untestable in this environment due to missing sandbox tenant credentials and customer/user binding context.

## Screenshots
- None captured in this heartbeat.
- Reason: no deployed/authenticated browser target and no live tenant session available for runbook clickthrough.

## Repro / unblock steps for blocker
1. Provision QA runtime with GST-9 runbook prerequisites:
   - sandbox M365 tenant
   - test customer id + test user key
   - Graph auth/token path that `adapter-m365` can use at runtime
2. Execute runbook sequence in `docs/gst-9-m365-smoke-runbook.md`:
   - `listUsers` -> `suspendUser` -> `readUserSnapshot` -> `resumeUser` -> final `getUser`
3. Capture UTC timestamp, sanitized customer/user identifiers, and operation results in issue evidence.
4. Use the runtime-context checklist in `docs/qa/GST-37-m365-sandbox-runtime-context-2026-05-28.md` to verify required env/Key Vault bindings before rerunning live smoke.

## QA disposition
- Status recommendation: **BLOCKED** (manual-live validation cannot be completed in current harness).
- Blocker owner: **Release Engineer**
- Required unblock action: provide sandbox tenant credentials/context and trigger a follow-up QA heartbeat for live smoke execution.
- Health score: **78/100** (local quality high, but required live manual gate incomplete).
