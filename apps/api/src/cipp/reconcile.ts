import type { CippSyncStore } from './store.js';
import type { CustomerMirrorRecord } from './types.js';

export interface CustomerSnapshotReader {
  listCustomerMirrorSnapshot(): Promise<readonly CustomerMirrorRecord[]>;
}

export async function runReconcile(
  reader: CustomerSnapshotReader,
  store: CippSyncStore,
): Promise<{ repaired: number }> {
  const snapshot = await reader.listCustomerMirrorSnapshot();
  return store.reconcileFromSnapshot(snapshot);
}
