import { describe, expect, it } from 'vitest';

import { runReconcile } from '../src/cipp/reconcile.js';
import { InMemoryCippSyncStore } from '../src/cipp/store.js';
import { buildSignature, processWebhookEvent } from '../src/cipp/webhook.js';

describe('cipp webhook idempotency + reconcile healing', () => {
  // Contract for webhook parity + cursor behavior is documented in docs/cipp-api-surface.md.
  it('does not duplicate writes on duplicate webhook deliveries', async () => {
    const store = new InMemoryCippSyncStore();
    const event = {
      eventId: 'evt-1',
      eventType: 'customer.updated' as const,
      customerId: 'cust-1',
      displayName: 'Acme',
      cippTenantId: 'tenant-1',
      sourceVersion: 2,
      eventTime: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(event);
    const secret = 'super-secret';
    const signature = `sha256=${buildSignature(rawBody, secret)}`;

    const firstParsed = processWebhookEvent({
      rawBody,
      signature,
      config: { secret, replayWindowSeconds: 300 },
    });
    const secondParsed = processWebhookEvent({
      rawBody,
      signature,
      config: { secret, replayWindowSeconds: 300 },
    });

    expect(firstParsed.accepted).toBe(true);
    expect(firstParsed.event).toBeDefined();
    expect(secondParsed.accepted).toBe(true);

    const firstQueue = await store.enqueueWebhookEvent(firstParsed.event!);
    const secondQueue = await store.enqueueWebhookEvent(secondParsed.event!);

    const drained = await store.drainWebhookEvents();

    expect(firstQueue).toEqual({ accepted: true });
    expect(secondQueue).toEqual({ accepted: false, reason: 'duplicate' });
    expect(drained.applied).toBe(1);
    expect(drained.skipped).toBe(0);
    expect(await store.snapshot()).toHaveLength(1);
  });

  it('rejects webhook payloads with invalid event types', async () => {
    const secret = 'super-secret';
    const rawBody = JSON.stringify({
      eventId: 'evt-invalid',
      eventType: 'tenant.rotated',
      customerId: 'cust-1',
      displayName: 'Acme',
      cippTenantId: 'tenant-1',
      sourceVersion: 2,
      eventTime: new Date().toISOString(),
    });
    const signature = `sha256=${buildSignature(rawBody, secret)}`;

    const parsed = processWebhookEvent({
      rawBody,
      signature,
      config: { secret, replayWindowSeconds: 300 },
    });

    expect(parsed).toEqual({ accepted: false, reason: 'invalid_payload' });
  });

  it('rejects webhook payloads with non-string identifier fields', async () => {
    const secret = 'super-secret';
    const rawBody = JSON.stringify({
      eventId: 123,
      eventType: 'customer.updated',
      customerId: 'cust-1',
      displayName: 'Acme',
      cippTenantId: 'tenant-1',
      sourceVersion: 2,
      eventTime: new Date().toISOString(),
    });
    const signature = `sha256=${buildSignature(rawBody, secret)}`;

    const parsed = processWebhookEvent({
      rawBody,
      signature,
      config: { secret, replayWindowSeconds: 300 },
    });

    expect(parsed).toEqual({ accepted: false, reason: 'invalid_payload' });
  });

  it('rejects webhook payloads with non-string eventTime', async () => {
    const secret = 'super-secret';
    const rawBody = JSON.stringify({
      eventId: 'evt-typed',
      eventType: 'customer.updated',
      customerId: 'cust-1',
      displayName: 'Acme',
      cippTenantId: 'tenant-1',
      sourceVersion: 2,
      eventTime: 1716942000,
    });
    const signature = `sha256=${buildSignature(rawBody, secret)}`;

    const parsed = processWebhookEvent({
      rawBody,
      signature,
      config: { secret, replayWindowSeconds: 300 },
    });

    expect(parsed).toEqual({ accepted: false, reason: 'invalid_payload' });
  });

  it('heals missed webhook by reconciliation snapshot', async () => {
    const store = new InMemoryCippSyncStore();

    const result = await runReconcile(
      {
        async listCustomerMirrorSnapshot() {
          return [
            {
              customerId: 'cust-heal',
              displayName: 'Recovered Customer',
              cippTenantId: 'tenant-heal',
              sourceVersion: 5,
              lastObservedAt: new Date().toISOString(),
              bindingState: 'bound' as const,
            },
          ];
        },
      },
      store,
    );

    expect(result.repaired).toBe(1);
    expect((await store.getCustomer('cust-heal'))?.displayName).toBe('Recovered Customer');
  });

  it('reconciles field changes when the source version is unchanged', async () => {
    const store = new InMemoryCippSyncStore();
    const baseRow = {
      customerId: 'cust-rename',
      cippTenantId: 'tenant-rename',
      sourceVersion: 0,
      lastObservedAt: '2026-05-29T00:00:00.000Z',
      bindingState: 'bound' as const,
    };

    const first = await store.reconcileFromSnapshot([{ ...baseRow, displayName: 'Old Name' }]);
    const second = await store.reconcileFromSnapshot([{ ...baseRow, displayName: 'New Name' }]);
    const noop = await store.reconcileFromSnapshot([{ ...baseRow, displayName: 'New Name' }]);

    expect(first.repaired).toBe(1);
    expect(second.repaired).toBe(1);
    expect(noop.repaired).toBe(0);
    expect((await store.getCustomer('cust-rename'))?.displayName).toBe('New Name');
  });

  it('marks local-only mirror rows as unbound during reconcile delete drift healing', async () => {
    const store = new InMemoryCippSyncStore();
    await store.applyWebhookEvent({
      eventId: 'evt-local-only',
      eventType: 'customer.updated',
      customerId: 'cust-local',
      displayName: 'Local Customer',
      cippTenantId: 'tenant-local',
      sourceVersion: 3,
      eventTime: new Date().toISOString(),
    });

    const result = await runReconcile(
      {
        async listCustomerMirrorSnapshot() {
          return [];
        },
      },
      store,
    );

    expect(result.repaired).toBe(1);
    expect((await store.getCustomer('cust-local'))?.bindingState).toBe('unbound');
  });

  it('does not mutate mirror when reconcile snapshot fetch fails', async () => {
    const store = new InMemoryCippSyncStore();
    await store.applyWebhookEvent({
      eventId: 'evt-fail-closed',
      eventType: 'customer.updated',
      customerId: 'cust-fail-closed',
      displayName: 'Bound Customer',
      cippTenantId: 'tenant-fail-closed',
      sourceVersion: 3,
      eventTime: new Date().toISOString(),
    });

    await expect(
      runReconcile(
        {
          async listCustomerMirrorSnapshot() {
            throw new Error('upstream unavailable');
          },
        },
        store,
      ),
    ).rejects.toThrow('upstream unavailable');

    expect((await store.getCustomer('cust-fail-closed'))?.bindingState).toBe('bound');
  });

  it('claims each received webhook once under concurrent drain attempts', async () => {
    const store = new InMemoryCippSyncStore();
    await store.enqueueWebhookEvent({
      eventId: 'evt-claim-1',
      eventType: 'customer.updated',
      customerId: 'cust-claim-1',
      displayName: 'Claim 1',
      cippTenantId: 'tenant-claim',
      sourceVersion: 1,
      eventTime: new Date().toISOString(),
    });
    await store.enqueueWebhookEvent({
      eventId: 'evt-claim-2',
      eventType: 'customer.updated',
      customerId: 'cust-claim-2',
      displayName: 'Claim 2',
      cippTenantId: 'tenant-claim',
      sourceVersion: 1,
      eventTime: new Date().toISOString(),
    });

    const [first, second] = await Promise.all([
      store.drainWebhookEvents(2),
      store.drainWebhookEvents(2),
    ]);
    const totalApplied = first.applied + second.applied;
    const snapshot = await store.snapshot();

    expect(totalApplied).toBe(2);
    expect(snapshot).toHaveLength(2);
  });

  it('does not process events already marked processing by another drain owner', async () => {
    const store = new InMemoryCippSyncStore();
    const now = new Date().toISOString();

    await store.enqueueWebhookEvent({
      eventId: 'evt-received',
      eventType: 'customer.updated',
      customerId: 'cust-received',
      displayName: 'Received',
      cippTenantId: 'tenant-owned',
      sourceVersion: 1,
      eventTime: now,
    });

    (store as unknown as {
      webhookEvents: Map<
        string,
        {
          customerId: string;
          eventType: 'customer.updated' | 'customer.deleted';
          eventId: string;
          payloadHash: string;
          sourceVersion: number;
          displayName: string;
          cippTenantId: string;
          eventTime: string;
          firstSeenAt: string;
          status: 'received' | 'processing' | 'applied' | 'duplicate' | 'stale' | 'replay_conflict';
        }
      >;
    }).webhookEvents.set('evt-foreign-processing', {
      customerId: 'cust-foreign',
      eventType: 'customer.updated',
      eventId: 'evt-foreign-processing',
      payloadHash: 'foreign-hash',
      sourceVersion: 1,
      displayName: 'Foreign',
      cippTenantId: 'tenant-owned',
      eventTime: now,
      firstSeenAt: now,
      status: 'processing',
    });

    const drained = await store.drainWebhookEvents(10);
    const snapshot = await store.snapshot();

    expect(drained.applied).toBe(1);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.customerId).toBe('cust-received');
  });
});
