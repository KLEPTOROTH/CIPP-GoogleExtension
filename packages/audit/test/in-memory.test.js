import { GenericProviderError, } from '@cipp-google/core';
import { describe, expect, test } from 'vitest';

import { InMemoryAuditStore } from '../src/index.js';
const userSnapshot = (customerId, targetUserId) => ({
    customerId,
    key: targetUserId,
    action: 'read',
    before: {
        id: targetUserId,
        customerId,
        email: `${targetUserId}@example.com`,
        displayName: targetUserId,
        suspended: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    after: {
        id: targetUserId,
        customerId,
        email: `${targetUserId}@example.com`,
        displayName: targetUserId,
        suspended: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    },
    timestamp: '2026-01-01T00:00:00.000Z',
});
const userRecord = (customerId, targetUserId) => ({
    id: targetUserId,
    customerId,
    email: `${targetUserId}@example.com`,
    displayName: targetUserId,
    suspended: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
});
const makeAuditPayload = (customerId, actorId, targetUserId, action, index) => ({
    action,
    customerId,
    key: targetUserId,
    actorId,
    correlationId: `req-${index}`,
    attempted: true,
    applied: true,
    m365Applied: true,
    googleApplied: false,
    startedAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    finishedAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    status: index % 2 === 0 ? 200 : 207,
    m365: {
        before: { ok: true, value: userSnapshot(customerId, targetUserId) },
        mutation: { ok: false, error: new GenericProviderError('google unavailable') },
        after: { ok: true, value: userSnapshot(customerId, targetUserId) },
    },
    google: {
        before: { ok: true, value: userSnapshot(customerId, targetUserId) },
        mutation: { ok: true, value: userRecord(customerId, targetUserId) },
        after: { ok: true, value: userSnapshot(customerId, targetUserId) },
    },
});
describe('InMemoryAuditStore', () => {
    test('supports actor/user/action/time filters and cursor pagination over 10k entries', async () => {
        const store = new InMemoryAuditStore();
        for (let index = 0; index < 10_000; index += 1) {
            const actorId = index % 3 === 0 ? 'actor-a' : index % 3 === 1 ? 'actor-b' : 'actor-c';
            const target = `user-${index % 100}`;
            await store.writeAuditRecord(makeAuditPayload('customer-a', actorId, target, index % 2 === 0 ? 'suspend' : 'resume', index));
        }
        const actorFilter = await store.readAudit({
            customerId: 'customer-a',
            actorId: 'actor-b',
            limit: 100,
        });
        expect(actorFilter.items.length).toBe(100);
        expect(actorFilter.nextCursor).toBeDefined();
        expect(actorFilter.items.every((row) => row.partitionKey === 'customer-a')).toBe(true);
        expect(actorFilter.items.every((row) => row.rowKey.length > 0)).toBe(true);
        actorFilter.items.forEach((row) => {
            expect(row.actorId).toBe('actor-b');
            expect(row.customerId).toBe('customer-a');
            expect(row.payload.customerId).toBe('customer-a');
            expect(row.payload.actorId).toBe('actor-b');
        });
        let cursor = actorFilter.nextCursor;
        let pageCount = 1;
        while (cursor) {
            const page = await store.readAudit({
                customerId: 'customer-a',
                actorId: 'actor-b',
                limit: 100,
                cursor,
            });
            pageCount += 1;
            expect(page.items.length).toBeGreaterThan(0);
            cursor = page.nextCursor;
            if (pageCount > 400) {
                throw new Error('pagination did not terminate over 10k dataset');
            }
        }
        const actionFilter = await store.readAudit({
            customerId: 'customer-a',
            action: 'suspend',
            limit: 50,
        });
        expect(actionFilter.items.every((row) => row.action === 'suspend')).toBe(true);
        expect(actionFilter.items[0].action).toBe('suspend');
        const requestFilter = await store.readAudit({
            customerId: 'customer-a',
            requestId: 'req-9999',
            limit: 10,
        });
        expect(requestFilter.items.length).toBe(1);
        expect(requestFilter.items[0].requestId).toBe('req-9999');
        expect(requestFilter.items[0].payload.correlationId).toBe('req-9999');
        const timeFiltered = await store.readAudit({
            customerId: 'customer-a',
            from: new Date(2026, 0, 1, 0, 0, 2).toISOString(),
            to: new Date(2026, 0, 1, 0, 0, 4).toISOString(),
        });
        expect(timeFiltered.items.length).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=in-memory.test.js.map