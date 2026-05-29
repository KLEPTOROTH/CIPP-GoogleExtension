# GST-11 Release Handoff (Release Engineer)

Issue: `GST-11`  
Scope: `executeAction` envelope + durable audit writer/reader path

## Release Decision

Status: **ready for release review**  
Owner for next step: **Release Engineer**  
Required approvals per repo policy: **CTO + QA Engineer**

## What Changed

1. `executeAction` now fails closed on audit persistence failure.
2. Action route requires durable audit store env configuration.
3. Durable audit store added in `@cipp-google/audit` (Azure Table index + Blob payload).
4. Append-only semantics enforced for persisted audit records.
5. Regression coverage added for failure invariants.

## Env Configuration (Required)

Set all three for API runtime:

1. `AUDIT_STORAGE_CONNECTION_STRING`
2. `AUDIT_TABLE_NAME`
3. `AUDIT_BLOB_CONTAINER`

Behavior if missing: action route returns `503` with `AUDIT_STORE_NOT_CONFIGURED`.

## Storage/Permission Prereqs

1. Storage account reachable from function runtime.
2. Connection string has permissions for:

- Table: create table, create entity, query entities.
- Blob: create container, create blob, read blob.

3. Container/table names comply with Azure naming rules.

## Deployment Gates

1. Dependency availability

- `@azure/data-tables`
- `@azure/storage-blob`

2. Runtime contract

- No success response allowed when audit write fails.
- Expected action statuses remain `200 | 207 | 502`.

3. Audit durability

- Blob payload writes with create-only semantics.
- Table index uses create-only semantics (append-only behavior).

## Post-Deploy Smoke (Minimal)

1. Configure env vars in deployed function app.
2. Execute one successful suspend/resume action.
3. Validate API response contains action envelope + audit metadata.
4. Validate one new index row exists in table for customer.
5. Validate referenced blob path exists and payload contains full channel snapshots.
6. Induce audit-write failure (permissions or wrong table/container) and verify route returns failure (`502` from envelope path / `503` when store not configured).

## Monitoring Signals

1. `AUDIT_STORE_NOT_CONFIGURED` responses > 0.
2. Increase in `502` on action route with `audit_write_failed` error marker.
3. Table/Blob write failures from function logs.

## Rollback Guidance

1. If durability path causes elevated failures, rollback API deploy to last stable build.
2. Preserve storage artifacts created during rollout.
3. Do not disable fail-closed semantics without CTO approval.

## Reviewer Checklist

1. QA confirms failure matrix and envelope expectations.
2. Release Engineer confirms env + IAM + smoke checks.
3. CTO confirms governance and append-only audit constraints are preserved.
