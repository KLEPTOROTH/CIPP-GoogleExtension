import { describe, expect, it } from 'vitest';

import { CORE_PACKAGE_NAME } from '@cipp-google/core';
import { buildSourceUrl } from '../pages/source';

describe('web smoke', () => {
  it('links @cipp-google/core', () => {
    expect(CORE_PACKAGE_NAME).toBe('@cipp-google/core');
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
});
