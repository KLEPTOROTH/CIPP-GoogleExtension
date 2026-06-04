# GST-96 Staff Pre-landing Review (2026-05-28)

## Scope execution evidence
- Replacement branch from `main`: `staff/gst-96-bounded-v0.1`
- Replacement PR: https://github.com/KLEPTOROTH/CIPP-GoogleExtension/pull/10
- Diff scope vs `origin/main`: 17 files
- Gate command: `tools/gst96-verify-bounded-scope.sh origin/main`
- Gate result: `PASS` with 17 changed files after explicit transitive-dependency exceptions for:
  - `apps/web/src/data/gst12Fixtures.ts`
  - `apps/web/src/components/TypedErrorBanner.tsx`

## Structural findings (must fix before landing)
1. `packages/core/src/execute-action.ts` imports unresolved local modules in this bounded slice:
   - `./types.js`
   - `./identity-provider.js`
2. `pnpm --filter @cipp-google/core build` fails with TS2307 unresolved-module errors because those dependencies are missing from the bounded branch.
3. `pnpm --filter @cipp-google/web build` is therefore not verifiable for the intended `@cipp-google/core` resolution path until (2) is fixed.

## Command evidence
- `pnpm --filter @cipp-google/core test -- execute-action.test.ts` -> pass
- `pnpm --filter @cipp-google/core build` -> fail (TS2307 missing `types.js` / `identity-provider.js`)
- `pnpm --filter @cipp-google/web build` -> fail downstream from unresolved core module graph

## Disposition
- Staff review status: **changes requested**
- Unblock owner: Implementer for GST-96/GST-89
- Required fix: include the minimal core dependency files required by `execute-action.ts` (or reduce `execute-action.ts` dependencies to main-compatible surface), then re-run:
  - `tools/gst96-verify-bounded-scope.sh origin/main`
  - `pnpm --filter @cipp-google/core build`
  - `pnpm --filter @cipp-google/web build`

## Handoff
- After dependency closure and green targeted verification, route CTO + QA review on PR #10.

## Addendum (2026-05-28, follow-up)
- Fixed by adding:
  - `packages/core/src/types.ts`
  - `packages/core/src/identity-provider.ts`
- Re-ran targeted checks:
  - `tools/gst96-verify-bounded-scope.sh origin/main` -> PASS
  - `pnpm --filter @cipp-google/core test -- execute-action.test.ts` -> PASS
  - `pnpm --filter @cipp-google/core build` -> PASS
  - `pnpm --filter @cipp-google/web build` -> PASS
- Updated changed-file count on bounded replacement PR: 20
- Staff disposition updated: structural blockers closed; route CTO + QA review.
