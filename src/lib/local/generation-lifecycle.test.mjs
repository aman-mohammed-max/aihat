import assert from 'node:assert/strict';
import test from 'node:test';

import { createGenerationLifecycle } from './generation-lifecycle.mjs';

test('closing an unfinished stream stops native generation once and drops later tokens', () => {
  let stops = 0;
  const tokens = [];
  const lifecycle = createGenerationLifecycle(() => stops++);

  lifecycle.push('first', (token) => tokens.push(token));
  lifecycle.close(false);
  lifecycle.push('late', (token) => tokens.push(token));
  lifecycle.close(false);

  assert.deepEqual(tokens, ['first']);
  assert.equal(stops, 1);
  assert.equal(lifecycle.closed, true);
});

test('closing after generation completes does not ask the native engine to stop', () => {
  let stops = 0;
  const lifecycle = createGenerationLifecycle(() => stops++);

  lifecycle.close(true);
  lifecycle.push('late', () => assert.fail('closed stream accepted a token'));

  assert.equal(stops, 0);
  assert.equal(lifecycle.closed, true);
});
