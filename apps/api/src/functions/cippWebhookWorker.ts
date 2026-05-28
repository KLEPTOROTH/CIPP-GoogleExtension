import { app, type InvocationContext, type Timer } from '@azure/functions';

import { createCippSyncStore } from '../cipp/store.js';

const syncStore = createCippSyncStore();

export async function cippWebhookWorker(_timer: Timer, context: InvocationContext): Promise<void> {
  try {
    const result = await syncStore.drainWebhookEvents(100);
    context.log(
      `cipp webhook worker: applied=${result.applied}, skipped=${result.skipped}, stale=${result.stale}, duplicate=${result.duplicate}, replayConflicts=${result.replayConflicts}`,
    );
  } catch (error) {
    context.log('cipp webhook worker failed', error);
    throw error;
  }
}

app.timer('cippWebhookWorker', {
  schedule: '0 */1 * * * *',
  handler: cippWebhookWorker,
});
