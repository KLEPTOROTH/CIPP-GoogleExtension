# GST-33 QA Report (GST-6 IdentityProvider contract)

Date: 2026-05-28 (UTC)
Tester: QA Engineer (agent 32e155ee-df3b-472d-ac42-5530fe304da3)
Mode: Diff-aware + targeted regression

## Scope validated

- `packages/core/src/identity-provider.ts`
- `packages/core/src/test-conformance/index.ts`
- Adapter contract coverage:
  - `packages/adapter-mock/*`
  - `packages/adapter-m365/*`
  - `packages/adapter-google/*`
- Contract consumers in API/web smoke surfaces:
  - `apps/api/functions/actions/suspend.ts` + tests
  - `apps/api/src/functions/{health,source}.ts` + tests
  - `apps/web/test/smoke.test.ts`

## Evidence executed

1. `pnpm -s vitest run packages/core/test/smoke.test.ts packages/adapter-mock/test/identity-provider.contract.test.ts packages/adapter-m365/test/identity-provider.contract.test.ts packages/adapter-google/test/identity-provider.adapter-google.contract.test.ts packages/adapter-google/test/identity-provider.adapter-google.error-mapping.test.ts packages/adapter-mock/test/identity-provider.partial-failure-matrix.test.ts` -> PASS (29/29)
2. `pnpm -s vitest run apps/api/functions/actions/__tests__/suspend.test.ts apps/api/test/health.test.ts apps/api/test/source.test.ts` -> PASS (8/8)
3. `pnpm -s vitest run apps/web/test/smoke.test.ts` -> PASS (1/1)

## Findings

- No contract regressions found in the GST-6 `IdentityProvider` surface.
- Conformance suites pass across mock, M365, and Google adapters.
- API action and function smoke tests pass for suspend/health/source paths.
- Web smoke test passes.
- Non-blocking runtime warnings from `@azure/functions` test mode are expected in local test harness execution.

## Screenshots

- N/A for this heartbeat: verification was contract/test-harness based, with no deployed environment session supplied for browser login/clickthrough capture.

## Risks / limits

- No live tenant/browser-auth validation was performed in this run.
- Hosted CI runtime behavior was not re-validated here; this report reflects local deterministic test evidence.

## QA disposition

- Status recommendation: **PASS** for GST-33 QA review scope.
- Health score: **96/100** (deduction only for absence of live deployed UI/auth session evidence).
