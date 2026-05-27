// Test runner: tsx --test (Node 20 built-in test runner), matching
// apps/api/test/health.test.ts conventions from GST-5 scaffolding.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { buildSourceManifest, source } from '../src/functions/source.js';

describe('buildSourceManifest', () => {
  it('returns env-provided values when SOURCE_* are populated', () => {
    const manifest = buildSourceManifest({
      SOURCE_COMMIT_SHA: 'abc123',
      SOURCE_TAG: 'v0.1.0',
      SOURCE_REPO_URL: 'https://example.invalid/repo',
      SOURCE_LICENSE: 'AGPL-3.0-only',
    } as NodeJS.ProcessEnv);

    assert.deepEqual(manifest, {
      commitSha: 'abc123',
      tag: 'v0.1.0',
      repoUrl: 'https://example.invalid/repo',
      license: 'AGPL-3.0-only',
    });
  });

  it('falls back to safe defaults when env is empty — `unknown` SHA/tag is the trip-wire', () => {
    const manifest = buildSourceManifest({} as NodeJS.ProcessEnv);
    assert.equal(manifest.commitSha, 'unknown');
    assert.equal(manifest.tag, 'unknown');
    assert.equal(manifest.repoUrl, 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension');
    assert.equal(manifest.license, 'AGPL-3.0');
  });
});

describe('source handler', () => {
  it('returns 200 with a manifest JSON body and a short cache header', async () => {
    const response = await source(
      {} as Parameters<typeof source>[0],
      {} as Parameters<typeof source>[1],
    );

    assert.equal(response.status, 200);
    const body = response.jsonBody as Record<string, unknown>;
    assert.equal(typeof body.commitSha, 'string');
    assert.equal(typeof body.tag, 'string');
    assert.equal(typeof body.repoUrl, 'string');
    assert.equal(typeof body.license, 'string');
    const cache = (response.headers as Record<string, string>)['Cache-Control'];
    assert.match(cache, /max-age=60/);
  });
});
