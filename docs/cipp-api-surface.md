# CIPP API Surface Reference (ARC extension-facing)

Document date: 2026-05-28  
Status: Locked for GST-14 planning  
Owner: CTO

This document is the API contract for the ARC API façade and the boundary between
ARC and CIPP, including hosted-vs-self-hosted behavioral notes.

## 1) Public boundary

- Browser extension and operators call ARC endpoints only.
- ARC calls CIPP through the CIPP adapter.
- CIPP credentials never travel to browser or UI storage.
- All calls include a request correlation id (`requestId`) for observability.

## 2) Base and route family

- Base path: `/api/v1`
- Transport: HTTPS only
- Auth model: function-level auth token (or equivalent) planned for GST-14

## 3) Stable response envelope

Success and error responses follow a fixed envelope to preserve compatibility.

```json
{
  "requestId": "uuid-v4",
  "ok": true,
  "data": {}
}
```

```json
{
  "requestId": "uuid-v4",
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR | AUTH_ERROR | AUTH_SCOPE_MISSING | CONNECTIVITY_ERROR | PARTIAL_FAILURE",
    "message": "human readable",
    "retryable": true,
    "details": {}
  }
}
```

## 4) CIPP capabilities endpoint

`GET /api/v1/cipp/capabilities`

Response contract:

```json
{
  "requestId": "uuid-v4",
  "ok": true,
  "data": {
    "cippMode": "hosted | self_hosted",
    "features": {
      "customerImport": true,
      "customerList": true,
      "customerRead": true,
      "healthCheck": true,
      "apiReferenceVersion": "string"
    },
    "limits": {
      "rateLimitPerMinute": null,
      "maxBatchSize": null
    }
  }
}
```

Notes:

- Stable keys only; values differ per deployment.
- `cippMode` changes runtime behavior and endpoint base in the adapter, never schema.
- Missing optional features must degrade gracefully at the API layer, never by removing fields.

## 5) CIPP connection lifecycle (GST-14 scope)

`POST /api/v1/integrations/cipp/validate`

- Validates base URL and credentials.
- Performs a minimal capability probe and required-scope check.
- Returns:
  - `200` when valid and required scopes present.
  - `400/422` on malformed URL or payload.
  - `401` on auth failure.
  - `422` with code `MISSING_SCOPE` when required scope is absent.
- Must not persist credentials on validation failure.

`POST /api/v1/integrations/cipp/connect`

- Persists a credential reference only after successful validation.
- Creates/updates integration metadata and writes `integrationState=connected`.
- Returns deterministic `integrationId` and `version`.

`GET /api/v1/integrations/cipp/status`

- Returns:
  - `connected`
  - `degraded`
  - `disconnected`
  - `invalid`
- Includes last successful probe timestamp and last failure reason.

`POST /api/v1/integrations/cipp/disconnect`

- Removes active credential reference from runtime config.
- Preserves `customerMirror` mappings for future reconnect.
- Returns `202` with cleanup summary.

`POST /api/v1/integrations/cipp/reconnect`

- Accepts new credential reference.
- Re-validates and refreshes runtime state without remapping customers.
- Returns `207` for partial refresh success/failover.

## 6) Customer mirror and sync readiness

`POST /api/v1/integrations/cipp/customers/import`

- Uses `adapter-cipp` to retrieve all available customers.
- Persists deterministic `CustomerMirror` rows.
- Idempotent behavior:
  - Re-import does not mutate canonical key fields.
  - Re-runs are de-duplicated by `(tenantId, externalCustomerId, sourceRevision)`.

`GET /api/v1/integrations/cipp/customers`

- Returns mirror view by integration state.
- Includes mapping hash and drift metadata.

## 7) Hosted-vs-Self-Hosted notes

### Hosted ARC mode

- Auth material location: ARC Key Vault.
- URL checks: ARC host reachability to CIPP public endpoint.
- Failure class for DNS/TLS issues: `CONNECTIVITY_ERROR` (`retryable=true`).
- Scope expectation: single canonical OAuth app per ARC environment.

### Self-hosted mode

- Auth material location: customer-managed secret reference plus tenant-scoped base URL.
- URL checks: TLS + path prefix + API version probe.
- Failure mode for customer-private endpoint: `CONNECTIVITY_ERROR` with details:
  - `scope=network`
  - `details.cause=unreachable|tls|invalid_api_version`.
- Scope expectation: per-tenant credential binding, same required scope set.

## 8) CIPP operation passthrough

`POST /api/v1/cipp/proxy`

- Request:
  - `operation` (allow-listed operation id)
  - `tenantId` (optional where operation is tenant-global)
  - `payload` (validated by operation schema)
- Response:
  - stable DTO from ARC, never raw CIPP payload.

## 9) Health endpoint

`GET /api/v1/health`

- `ok=true` should mean function app booted.
- `connected=true` indicates integration-level readiness.
- If integration fails, `connected=false` with reason details.

## 10) Error mapping (selected)

- `MISSING_SCOPE` -> required scope absent.
- `INVALID_BASE_URL` -> no valid route to endpoint.
- `AUTH_ERROR` -> bad API token/client secret.
- `CONNECTIVITY_ERROR` -> network/DNS/TLS failure.
- `PARTIAL_FAILURE` -> one provider/dependency succeeds and one fails.
- `STATE_CONFLICT` -> simultaneous edits during reconnect/disconnect.

## 11) GST-22 parity evidence (adapter-cipp v0.1 scope)

Evidence date: 2026-05-28

Primary sources:
- CIPP OpenAPI spec (`openapi.json`) from `KelvinTegelaar/CIPP-API` commit `6871d267ebec580b5097f44e7623c0d71c2c5581`
- CIPP docs: API setup/auth and hosted integration guidance
  - https://docs.cipp.app/api-documentation/setup-and-authentication
  - https://docs.cipp.app/user-documentation/cipp/integrations/cipp-api
  - https://docs.cipp.app/setup/self-hosting-guide/self-hosted-api-setup

Parity legend:
- `full`: endpoint exists in CIPP API surface and hosted/self-hosted setup paths both documented.
- `partial`: endpoint exists but hosted-vs-self-hosted behavior is not fully documented at endpoint granularity.
- `missing`: required endpoint not found in current CIPP API surface.

| ARC adapter operation | CIPP endpoint(s) | Hosted | Self-hosted | Parity |
|---|---|---|---|---|
| List customers (`listCustomers`) | `GET /ListTenants` | Available through CIPP-API client flow | Available via self-hosted API setup + CIPP-API client flow | `full` |
| List users (`listUsers`) | `GET /ListUsers` | Available through CIPP-API client flow | Available via self-hosted API setup + CIPP-API client flow | `full` |
| Get user (`getUser`) | `GET /ListUsers` with `UserID` query | Available | Available | `full` |
| Suspend user (`suspendUser`) | `GET /ExecDisableUser` with `Enable=false` | Available | Available | `full` |
| Resume user (`resumeUser`) | `GET /ExecDisableUser` with `Enable=true` | Available | Available | `full` |
| Webhook ingest (future phase) | `GET/POST /PublicWebhooks` | Endpoint present; hosted event catalog not fully documented | Endpoint present | `partial` |

CTO recommendation (GST-22 gate):
- `PROCEED` for v0.1 read + suspend/resume scope using the operations above.
- Do not gate v0.1 on webhook parity; treat webhook behaviors as phase-gated until hosted event coverage is explicitly validated in-production.
