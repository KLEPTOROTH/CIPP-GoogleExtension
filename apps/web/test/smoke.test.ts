import { describe, expect, it } from 'vitest';

import { CORE_PACKAGE_NAME } from '@cipp-google/core';

describe('web smoke', () => {
  it('links @cipp-google/core', () => {
    expect(CORE_PACKAGE_NAME).toBe('@cipp-google/core');
  });
});
