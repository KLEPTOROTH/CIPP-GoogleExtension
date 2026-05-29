# GST-96 Staff Execution Packet — Bounded PR Cut + Evidence Protocol (2026-05-28)

Use this packet to execute the CTO lock in `docs/reviews/gst-96-cto-lock-2026-05-28.md`.

## 1) Branch cut procedure (from `main`)

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c chore/gst-96-bounded-v0.1
```

Apply only lock-approved files and commit in logical slices.

## 2) Scope guard (must pass before PR open)

New tooling:
- `tools/gst96-allowed-paths.txt`
- `tools/gst96-verify-bounded-scope.sh`

Run:

```bash
bash tools/gst96-verify-bounded-scope.sh origin/main
```

Gate behavior:
- Fails if changed files exceed 45.
- Fails if any changed file is outside allowlist.

Current oversized branch evidence (for context):
- `129 files changed, 14,060 insertions, 43 deletions`
- Gate output: `FAIL: changed file count 129 exceeds GST-96 budget 45`

## 3) Required targeted verification

```bash
pnpm --filter @cipp-google/core test -- execute-action.test.ts
pnpm --filter @cipp-google/api test -- cipp-sync.test.ts cipp-store-factory.test.ts
pnpm test:e2e:gst64
```

Attach command + pass/fail output in PR description.

## 4) PR evidence payload (must be posted on GST-89 and GST-67)

Post these fields exactly:
1. New bounded PR URL
2. Changed-file count (`git diff --name-only origin/main...HEAD | wc -l`)
3. `bash tools/gst96-verify-bounded-scope.sh origin/main` output
4. Targeted test command outputs
5. Playwright smoke artifact URL/verdict

## 5) Routing

After evidence is posted:
1. Route to **Staff Engineer** for final structural pre-merge review.
2. Route to **QA Engineer** for verification signoff artifacts.
3. Return to **CTO** for final merge-candidate gate.
4. Then **Release Engineer** executes merge path when all approvals + CI are green.

## 6) Escalation rule

If bounded scope cannot satisfy the v0.1 promise within the 45-file budget:
- Mark GST-96 blocked.
- Open child issue with explicit overflow file list and runtime-critical justification per file.

