import type { HttpRequest, InvocationContext } from '@azure/functions';
import { expect, test } from 'vitest';

import { buildSourceManifest, sourceHandler } from '../src/functions/source.js';

test('buildSourceManifest defaults unknown values when env is empty', () => {
  const manifest = buildSourceManifest({});
  expect(manifest.commitSha).toBe('unknown');
  expect(manifest.tag).toBe('unknown');
  expect(manifest.repoUrl).toBe('https://github.com/KLEPTOROTH/CIPP-GoogleExtension');
  expect(manifest.license).toBe('AGPL-3.0');
});

test('sourceHandler returns a stable manifest payload', async () => {
  const result = await sourceHandler({} as HttpRequest, {} as InvocationContext);
  expect(result.status).toBe(200);
  const body = result.jsonBody as unknown as {
    commitSha: string;
    tag: string;
    repoUrl: string;
    license: string;
  };

  expect(body.repoUrl).toBe('https://github.com/KLEPTOROTH/CIPP-GoogleExtension');
  expect(body.license).toBe('AGPL-3.0');
});
