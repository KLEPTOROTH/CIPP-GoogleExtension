import type { HttpRequest, InvocationContext } from '@azure/functions';
import { expect, test } from 'vitest';

import { health } from '../src/functions/health.js';

test('health returns 200 with ok=true', async () => {
  const result = await health({} as HttpRequest, {} as InvocationContext);
  expect(result.status).toBe(200);
  const body = result.jsonBody as { ok: boolean; service: string };
  expect(body.ok).toBe(true);
  expect(body.service).toBe('cipp-google-api');
});
