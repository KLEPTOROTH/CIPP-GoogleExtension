# GST-6 Staff Engineer Pre-Landing Review (2026-05-28)

Disposition: **Not approved**. Send back to implementer.

## Structural findings

1. Blocking compile defect in `packages/core/src/execute-action.ts`.
- `AuditEntry` is imported from `./identity-provider.js`, but that module does not export `AuditEntry`.
- Required fix: import `AuditEntry` from `./types.js` (or re-export `AuditEntry` from `identity-provider.ts` and keep imports consistent).

2. TS strict error in `packages/core/src/types.ts`.
- `ProviderError.cause` overrides `Error.cause` but is declared without `override`.
- Required fix: add `override` to `cause` declaration, or stop redeclaring it.

3. Invariant gap in `packages/core/src/execute-action.ts` status mapping.
- `status` and `chip` depend only on mutation outcomes; they ignore failures in `readUserSnapshot` before/after reads.
- Production risk: operation can be reported as 200/207 while audit evidence is missing or stale.
- Required fix: include audit read success/failure in terminal status/chip logic and extend tests for this failure mode.

4. Contract-suite packaging/typecheck risk in `packages/core/src/test-conformance/index.ts`.
- Conformance entrypoint imports `vitest` directly from `src`, coupling runtime/typecheck to test-only dependency.
- Required fix: isolate conformance test harness as test-only artifact or ensure dependency/type wiring is explicit and strict-clean.

## Verification notes

- `pnpm --filter @cipp-google/core typecheck` currently fails in this workspace because local deps/tooling are missing (`tsc: not found`).
- Earlier run already captured concrete TS failures against these files; this follow-up confirms findings are still unresolved in source.
- Web research directive assessed: not needed for these blockers since failures are local and deterministic.
