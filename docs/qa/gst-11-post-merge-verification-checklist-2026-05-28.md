# GST-11 Post-Merge QA Verification Checklist (2026-05-28)

Issue: `GST-11`  
PR gate: `#3` (`chore/gst-18-branch-protection` -> `main`)

## Preconditions

1. PR `#3` merged to `main`.
2. CI for merge commit is green.
3. Runtime env contains:
- `AUDIT_STORAGE_CONNECTION_STRING`
- `AUDIT_TABLE_NAME`
- `AUDIT_BLOB_CONTAINER`

## API Functional Checks

1. `suspend` success path
- Call suspend action for seeded test user with both providers healthy.
- Expect `200` response and chip/status indicating successful suspension.

2. `resume` success path
- Call resume action for same user.
- Expect `200` response and chip/status indicating active state.

3. Partial failure path
- Simulate one provider unavailable.
- Expect `207` and per-provider mutation/read details preserved in envelope.

4. Total failure path
- Simulate both providers failing.
- Expect `502` and audit `attempted=true`, `applied=false` semantics.

## Durable Audit Checks

1. For each successful mutation, verify exactly one index row exists for customer/timestamp window.
2. Verify index row contains IDs/timestamps/metadata only (no raw PII payload fields beyond allowed IDs).
3. Verify blob payload exists at `blobPath` and includes full before/after + provider results.
4. Validate append-only behavior:
- No update/delete path exposed via API.
- Duplicate write attempts should not overwrite existing audit record.

## Fail-Closed Audit Check

1. Force audit storage write failure while provider mutation succeeds.
2. Expect action response to fail closed (`502`), not `200/207`.
3. Confirm envelope reflects failure outcome and does not claim successful applied state.

## Reader Checks (Scale)

1. Seed/load 10k audit entries for one customer.
2. Validate filters independently:
- `customerId`
- `targetUserId`
- `actorId`
- `action`
- `from/to`
3. Validate cursor pagination:
- No missing rows
- No duplicate rows
- Stable forward traversal to terminal cursor

## Evidence to Attach in QA Report

1. API response samples for `200`, `207`, `502`.
2. One table index row sample (redacted where needed).
3. One blob payload sample (sensitive fields redacted as required by policy).
4. Pagination run summary over 10k dataset.
5. Explicit pass/fail verdict for GST-11 acceptance criteria.

## Handoff Rule

If all checks pass: mark QA approval on GST-11 / PR and hand back for release close-out.  
If any check fails: file blocker with exact failing step + reproduction input + observed/expected output.
