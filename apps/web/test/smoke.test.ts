import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { CORE_PACKAGE_NAME } from '@cipp-google/core';

test('core package is linked from web app', () => {
  assert.equal(CORE_PACKAGE_NAME, '@cipp-google/core');
});
