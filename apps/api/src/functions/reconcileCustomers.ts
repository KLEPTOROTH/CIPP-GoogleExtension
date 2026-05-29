import { app, type InvocationContext, type Timer } from '@azure/functions';

import { createCippSyncStore } from '../cipp/store.js';

const syncStore = createCippSyncStore();

export async function reconcileCustomers(_timer: Timer, context: InvocationContext): Promise<void> {
  const baseUrl = process.env.CIPP_BASE_URL;
  const token = process.env.CIPP_API_TOKEN;
  if (!baseUrl || !token) {
    context.log('reconcile skipped: CIPP_BASE_URL/CIPP_API_TOKEN not configured');
    return;
  }

  await syncStore.drainWebhookEvents();
  context.log('reconcile skipped: CIPP snapshot adapter is not included in the bounded demo PR');
}

app.timer('reconcileCustomers', {
  schedule: '0 */15 * * * *',
  handler: reconcileCustomers,
});
