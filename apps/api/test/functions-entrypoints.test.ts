import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('Azure Functions runtime entrypoints', () => {
  it('loads suspend/resume action routes from the compiled functions tree', async () => {
    await import('../src/functions/suspend.js');

    await assert.doesNotReject(access(path.resolve('src/functions/suspend.ts')));
    await assert.doesNotReject(access(path.resolve('functions/actions/suspend.ts')));
  });
});
