# GST-23 Phase 1 Implementation Notes

This change implements the initial `adapter-cipp` read path, signed webhook ingest, and 15-minute reconciliation loop described in [cipp-api-surface](./cipp-api-surface.md).

## Implemented surface

- `packages/adapter-cipp`
- `POST /api/v1/webhooks/cipp/customer-change`
- `reconcileCustomers` timer function (`0 */15 * * * *`)
- Durable webhook replay/index store in `apps/api/src/cipp/store.ts` (Azure Table-backed when storage is available, otherwise safe in-memory fallback)
- Async upsert path via `apps/api/src/functions/cippWebhook.ts` and `apps/api/src/functions/cippWebhookWorker.ts`

## Parity link

Contract assumptions and response-shape alignment are anchored to:

- `docs/cipp-api-surface.md`
- `docs/gst-22-rest-api-surface-and-parity-spike.md`

## Acceptance evidence mapping

- Duplicate webhook deliveries: `apps/api/test/cipp-sync.test.ts` (`duplicate` case)
- Missed webhook healed by reconcile: `apps/api/test/cipp-sync.test.ts` (`heals missed webhook` case)
- Queue-backed replay dedupe and stale/same-event gating: `apps/api/src/cipp/store.ts`
- Adapter contract fixture coverage: `packages/adapter-cipp/test/adapter-cipp.test.ts`
