import { describe, expect, it } from 'vitest';

import { CORE_PACKAGE_NAME } from '@cipp-google/core';
import { buildSourceManifest, buildSourceUrl } from '../src/sourceManifest';
import { isUnifiedActionDisabled } from '../src/lib/userActionState';

describe('web smoke', () => {
  it('links @cipp-google/core', () => {
    expect(CORE_PACKAGE_NAME).toBe('@cipp-google/core');
  });

  it('disables unified user actions until hydration and for non-actionable states', () => {
    expect(isUnifiedActionDisabled('Active', false)).toBe(true);
    expect(isUnifiedActionDisabled('Active', true)).toBe(false);
    expect(isUnifiedActionDisabled('Suspended', true)).toBe(false);
    expect(isUnifiedActionDisabled('Inconsistent', true)).toBe(true);
    expect(isUnifiedActionDisabled('Unknown', true)).toBe(true);
  });

  it('builds source URLs from stamped tag or commit manifest values', () => {
    expect(
      buildSourceUrl({
        commitSha: '0123456789abcdef',
        tag: 'v0.1.0',
        repoUrl: 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension',
        license: 'AGPL-3.0',
      }),
    ).toBe('https://github.com/KLEPTOROTH/CIPP-GoogleExtension/tree/v0.1.0');

    expect(
      buildSourceUrl({
        commitSha: '0123456789abcdef',
        tag: 'unknown',
        repoUrl: 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension/',
        license: 'AGPL-3.0',
      }),
    ).toBe('https://github.com/KLEPTOROTH/CIPP-GoogleExtension/commit/0123456789abcdef');
  });

  it('builds the same-origin source manifest from stamped env values', () => {
    expect(
      buildSourceManifest({
        SOURCE_COMMIT_SHA: '0123456789abcdef',
        SOURCE_TAG: 'v0.1.0',
        SOURCE_REPO_URL: 'https://example.invalid/repo',
        SOURCE_LICENSE: 'AGPL-3.0-only',
      }),
    ).toEqual({
      commitSha: '0123456789abcdef',
      tag: 'v0.1.0',
      repoUrl: 'https://example.invalid/repo',
      license: 'AGPL-3.0-only',
    });
  });

  it('falls back for empty source manifest env values', () => {
    expect(
      buildSourceManifest({
        SOURCE_COMMIT_SHA: '',
        SOURCE_TAG: '',
        SOURCE_REPO_URL: '',
        SOURCE_LICENSE: '',
      }),
    ).toEqual({
      commitSha: 'unknown',
      tag: 'unknown',
      repoUrl: 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension',
      license: 'AGPL-3.0',
    });
  });
});
