import { app, type InvocationContext, type Timer } from '@azure/functions';

import { runReconcile } from '../cipp/reconcile.js';
import { createCippSyncStore } from '../cipp/store.js';
import type { CustomerMirrorRecord } from '../cipp/types.js';

const syncStore = createCippSyncStore();

export async function reconcileCustomers(_timer: Timer, context: InvocationContext): Promise<void> {
  const baseUrl = process.env.CIPP_BASE_URL;
  const token = process.env.CIPP_API_TOKEN;
  if (!baseUrl || !token) {
    context.log('reconcile skipped: CIPP_BASE_URL/CIPP_API_TOKEN not configured');
    return;
  }

  const { CippAdapter } = await import('@cipp-google/adapter-cipp');
  const adapter = new CippAdapter({ baseUrl, apiToken: token });
  const reconciled = await runReconcile(
    {
      async listCustomerMirrorSnapshot(): Promise<readonly CustomerMirrorRecord[]> {
        const customers = await adapter.listCustomers();
        if (!customers.ok) {
          return [];
        }

        return customers.value.map((customer) => ({
          customerId: customer.id,
          displayName: customer.name,
          cippTenantId: customer.id,
          sourceVersion: 0,
          lastObservedAt: new Date().toISOString(),
          bindingState: 'bound',
        }));
      },
    },
    syncStore,
  );

  context.log(`reconcile finished: repaired=${reconciled.repaired}`);
}

app.timer('reconcileCustomers', {
  schedule: '0 */15 * * * *',
  handler: reconcileCustomers,
});
