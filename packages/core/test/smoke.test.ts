import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { CORE_PACKAGE_NAME } from '../src/index.js';

test('core exports its package name constant', () => {
  assert.equal(CORE_PACKAGE_NAME, '@cipp-google/core');
});
