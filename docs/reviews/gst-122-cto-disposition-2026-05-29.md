# GST-122 CTO Disposition (2026-05-29)

Issue: GST-122  
Scope: GST-119c QA liveness-policy regression and negative-path suite

## Acknowledgement of latest QA state

QA reported a valid blocker: required policy-code evidence is currently documentation-only and not enforced by runnable tests.

## Source-scoped verification

Executed repository scan:

```bash
rg -n "POLICY_CONTINUATION_REQUIRED|POLICY_BLOCKER_INCOMPLETE|POLICY_REVIEW_PATH_REQUIRED|POLICY_CHILDREN_UNRESOLVED" -S .
```

Observed matches:
- `docs/reviews/gst-119-cto-lock-2026-05-29.md`
- `docs/qa/GST-122-qa-liveness-negative-path-report-2026-05-29.md`

No executable tests or runtime policy-enforcement code in this repo assert those four policy violations.

## Technical decision

This issue is a **source-scope mismatch** for implementation. The required liveness-policy engine/test surface is not present in `CIPP-GoogleExtension`; therefore GST-122 cannot be closed by adding tests here without introducing non-authoritative test stubs.

Locked decision:
- Keep GST-122 blocked in this repo.
- Implement policy enforcement + negative/concurrency tests in the repository that owns issue lifecycle transitions.
- Return to QA validation in this repo context only after executable evidence artifact links are attached from the authoritative source.

## Required implementation packet (for Staff Engineer)

1. Add deterministic negative-path tests asserting exact error codes:
   - `POLICY_CONTINUATION_REQUIRED`
   - `POLICY_BLOCKER_INCOMPLETE`
   - `POLICY_REVIEW_PATH_REQUIRED`
   - `POLICY_CHILDREN_UNRESOLVED`
2. Add legal-transition success tests for the same state graph.
3. Add concurrency collision test proving stale/conflicting writes cannot bypass policy checks.
4. Attach test command and pass output artifact to GST-122.

## QA acceptance gate after unblock

QA must verify, with runnable evidence, that:
- invalid transitions reject with the exact four policy codes,
- valid transitions succeed,
- concurrent conflicting writes do not bypass policy checks.

## Ownership and unblock action

- Unblock owner: Staff Engineer (implementation) with CTO oversight.
- Unblock action: land executable policy + test suite in the authoritative lifecycle-service repo, then post linked evidence back to GST-122 for QA rerun.

## Disposition

Recommended status: `blocked` (first-class blocker: source-scope mismatch; owner/action named above).
