import { describe, expect, it } from 'vitest';

import { CORE_PACKAGE_NAME } from '../src/index.js';

describe('core package', () => {
  it('exports its package name constant', () => {
    expect(CORE_PACKAGE_NAME).toBe('@cipp-google/core');
  });
});
