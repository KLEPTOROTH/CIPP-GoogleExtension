# Runbook: CIPP Connect Setup and Reconnect

Date: 2026-05-28  
Scope: GST-14 v0.1  
Audience: Operator, Release Engineer, QA Engineer

## 1) Purpose

This runbook defines the standard procedure to connect the ARC extension backend
to a CIPP REST endpoint, import customer mirrors, and preserve mapping continuity
through credential rotation.

## 2) Prerequisites

- Access to Azure Key Vault in the ARC deployment environment.
- `apiSecretRef` target pre-created in Key Vault:
  - value is the raw CIPP API secret/token
  - no secret values in source control
- CIPP endpoint reachable by ARC function runtime.
- Required scopes approved for the target CIPP tenant/app.
- `SOURCE_REPO_URL` configured in deploy settings and health endpoint returning.

## 3) Hosted vs self-hosted notes

Use `docs/cipp-api-surface.md` for canonical API behavior and mode flags.

Hosted mode:
- ARC owns secret material and lifecycle.
- Endpoint pattern is stable across tenant environments.
- Network trust is mostly Azure-hosted; use Azure-side connectivity checks.

Self-hosted mode:
- Secret material reference may come from tenant-managed store or explicit reference passed in configuration.
- Verify base URL protocol/hostname and CA chain before validation.
- Expect more variable error shapes; always rely on normalized ARC error codes.

## 4) Initial connect

1. Open admin integration screen in the web UI.
2. Enter:
   - CIPP base URL
   - credential reference name (Key Vault reference key path)
3. Click **Validate**.
4. On success, click **Connect**.
5. Confirm:
   - integration state is `connected`
   - status view returns healthy probe timestamp
   - customer import summary is visible with expected row count
6. Verify customer table with:
   - stable `displayName` and deterministic IDs
   - zero duplicate `cippCustomerId`

## 5) Validating failure handling

Expected failure classes:

- `INVALID_URL`: correct base URL format and path.
- `AUTH_ERROR`: wrong API secret or client secret not accepted by CIPP.
- `MISSING_SCOPE`: rotate CIPP app permissions and reconnect.
- `CONNECTIVITY_ERROR`: retry and open network path checks (DNS/TLS/firewall).

Actions:

- keep state as `disconnected` on pre-save failure
- do not create/replace `CIPPIntegrationState.secretRef` on validation failure
- capture `requestId` and `error.code` in the issue queue for RCA

## 6) Credential rotation (reconnect)

1. Create rotated secret in Key Vault and confirm naming.
2. Open integration settings and select **Reconnect**.
3. Paste new secret reference and submit.
4. Confirm:
   - status transitions through `validating`
5. Verify:
   - existing `CustomerMirror` rows count unchanged
   - customer IDs not regenerated during reconnect
6. If reconnect returns partial warning:
   - preserve successful mappings
   - rerun sync and record warning reasons as blocked backlog.

## 7) Disconnect

1. Trigger disconnect from admin integration panel.
2. Confirm integration state transitions to `disconnected`.
3. Confirm `CustomerMirror` rows remain in storage for future reconnect.
4. Confirm new connect uses existing mirror history and does not treat it as a first-time import.

## 8) Health checks and periodic monitoring

Every automated check should poll:
- `GET /api/v1/integrations/cipp/status`
- `GET /api/v1/health`

Alert/rollback rule:
- any sustained `degraded` state for 3 checks should trigger ops notification
- stale health > 10 minutes should trigger immediate manual re-check

## 9) Audit and evidence

When opening a support ticket, include:
- operator action (`connect|reconnect|disconnect`)
- requestId from UI/API
- last 3 status transitions for integration
- sanitized base URL and secret reference ID (no secret bytes)

## 10) Do not do

- never copy secret bytes into browser session storage
- never edit table rows directly for reconnect remediation
- never map import IDs from display names alone
- never suppress `MISSING_SCOPE` by downgrading permissions silently

## 11) Escalation path

If repeated reconnect attempts fail:
1. Validate CIPP endpoint and cert path manually.
2. Validate Key Vault access and reference string.
3. Open ticket with:
   - GST-14 issue reference
   - captured `requestId`
   - `CIPP` mode and endpoint host
4. Include evidence from this runbook section 5 and status transition log.
