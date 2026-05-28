import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

import { createCippSyncStore } from '../cipp/store.js';
import { processWebhookEvent } from '../cipp/webhook.js';

const syncStore = createCippSyncStore();

export async function cippWebhook(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  const secret = process.env.CIPP_WEBHOOK_SECRET ?? '';
  if (!secret) {
    return {
      status: 503,
      jsonBody: { ok: false, error: { code: 'webhook_secret_missing' } },
    };
  }

  const signature = request.headers.get('x-cipp-signature') ?? '';
  const rawBody = await request.text();
  const parsed = processWebhookEvent({
    rawBody,
    signature,
    config: { secret, replayWindowSeconds: 300 },
  });

  if (!parsed.accepted || !parsed.event) {
    if (parsed.reason === 'stale') {
      return { status: 202, jsonBody: { ok: true, stale: true } };
    }
    const status = parsed.reason === 'invalid_signature' ? 401 : 409;
    return {
      status,
      jsonBody: {
        ok: false,
        error: {
          code: parsed.reason ?? 'invalid_payload',
        },
      },
    };
  }

  const result = await syncStore.enqueueWebhookEvent(parsed.event);
  if (result.accepted) {
    return { status: 202, jsonBody: { ok: true } };
  }

  if (result.reason === 'duplicate') {
    return { status: 200, jsonBody: { ok: true, duplicate: true } };
  }

  return {
    status: 409,
    jsonBody: {
      ok: false,
      error: {
        code: result.reason,
      },
    },
  };
}

app.http('cippWebhookCustomerChange', {
  route: 'v1/webhooks/cipp/customer-change',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: cippWebhook,
});
