# GST-9 MS365 Smoke Runbook (Phase 1)

Issue: `GST-9`  
Scope: `adapter-m365` read + suspend surface  
Owners: Release Engineer (execution), QA Engineer (verification sign-off)

## Purpose

Close the final acceptance gate for GST-9 by running a live Microsoft 365 sandbox smoke flow:

1. `listUsers`
2. `suspendUser`
3. `readUserSnapshot`
4. `resumeUser`

This runbook is the authoritative acceptance procedure for the manual validation requirement.

## Preconditions

1. A Microsoft 365 Developer Program sandbox tenant is available.
2. A non-production test user exists in that tenant.
3. Runtime has valid tenant/token prerequisites used by `adapter-m365`:
   - customer tenant resolution path
   - Graph app credentials
   - Key Vault access (if used in this environment)
4. The target build contains the current GST-9 `adapter-m365` changes.

## Trust Boundaries

1. No destructive lifecycle actions are permitted.
2. Only `accountEnabled` mutation is allowed for v0.1.
3. No user delete operation is allowed or required.

## Test Sequence

Use one test customer and one known test user key.

1. Baseline read
   - Call `listUsers(customer)`.
   - Confirm test user is present.
   - Call `getUser(customer, key)`.
   - Record baseline `suspended` state.
2. Suspend path
   - Call `suspendUser(customer, key)`.
   - Expected: success result, returned user has `suspended: true`.
3. Snapshot path
   - Call `readUserSnapshot(customer, key)`.
   - Expected:
     - `action` reflects latest mutation/read semantics from adapter.
     - `before` and `after` are populated with core `User` shape.
4. Resume path
   - Call `resumeUser(customer, key)`.
   - Expected: success result, returned user has `suspended: false`.
5. Post-check
   - Call `getUser(customer, key)` once more.
   - Confirm final `suspended: false`.

## Pass/Fail Criteria

Pass if all conditions are true:

1. All four operations complete without unhandled exceptions.
2. Suspend toggles `accountEnabled` behavior through `suspended: true`.
3. Resume restores `suspended: false`.
4. Snapshot result is returned as core `AuditEntry`/`User` types (no raw Graph payload leakage).
5. No delete call is performed.

Fail on any condition break, including typed error mapping regressions or state mismatch.

## Evidence To Capture

Record the following in GST-9 comment/update:

1. Timestamp (UTC) and environment identifier.
2. Customer id and test user key (sanitized if needed).
3. Operation results for all sequence steps.
4. Any provider error code/class if a step fails.
5. Final disposition recommendation:
   - `done` if pass
   - `blocked` with owner/action if fail

## Escalation Matrix

1. Release Engineer
   - Runs this smoke and posts evidence.
2. QA Engineer
   - Verifies evidence quality and confirms acceptance.
3. Staff Engineer
   - Handles code-level remediation if smoke fails.

