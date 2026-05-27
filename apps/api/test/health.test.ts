import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { HttpRequest, InvocationContext } from '@azure/functions';

import { health } from '../src/functions/health.js';

test('health returns 200 with ok=true', async () => {
  const result = await health({} as HttpRequest, {} as InvocationContext);
  assert.equal(result.status, 200);
  const body = result.jsonBody as { ok: boolean; service: string };
  assert.equal(body.ok, true);
  assert.equal(body.service, 'cipp-google-api');
});
