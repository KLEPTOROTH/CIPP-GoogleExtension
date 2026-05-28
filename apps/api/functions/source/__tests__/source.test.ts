import { describe, expect, it } from 'vitest';

import { buildSourceManifest, sourceHandler } from '../index';

const stubContext = {} as Parameters<typeof sourceHandler>[1];
const stubRequest = {} as Parameters<typeof sourceHandler>[0];

describe('buildSourceManifest', () => {
  it('returns env-provided values when SOURCE_* are populated', () => {
    expect(
      buildSourceManifest({
        SOURCE_COMMIT_SHA: 'abc123',
        SOURCE_TAG: 'v0.1.0',
        SOURCE_REPO_URL: 'https://example.invalid/repo',
        SOURCE_LICENSE: 'AGPL-3.0-only',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      commitSha: 'abc123',
      tag: 'v0.1.0',
      repoUrl: 'https://example.invalid/repo',
      license: 'AGPL-3.0-only',
    });
  });

  it('falls back to safe defaults when env is empty — `unknown` SHA/tag is the trip-wire', () => {
    const manifest = buildSourceManifest({} as NodeJS.ProcessEnv);
    expect(manifest.commitSha).toBe('unknown');
    expect(manifest.tag).toBe('unknown');
    expect(manifest.repoUrl).toBe('https://github.com/KLEPTOROTH/CIPP-GoogleExtension');
    expect(manifest.license).toBe('AGPL-3.0');
  });
});

describe('sourceHandler', () => {
  it('returns 200 with the manifest JSON body', async () => {
    const response = await sourceHandler(stubRequest, stubContext);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({
      commitSha: expect.any(String),
      tag: expect.any(String),
      repoUrl: expect.any(String),
      license: expect.any(String),
    });
    expect(response.headers).toMatchObject({ 'Cache-Control': expect.stringContaining('max-age=60') });
  });
});
