import assert from 'node:assert/strict';
import test from 'node:test';

import { canLoadModel, initialModelRuntime, shouldUnloadModel, transitionModelRuntime } from './model-runtime.mjs';

test('tracks model loading, loaded, failed, and unloaded states', () => {
  let state = transitionModelRuntime(initialModelRuntime, { type: 'load-start', id: 'model-a' });
  assert.deepEqual({ modelId: state.modelId, phase: state.phase }, { modelId: 'model-a', phase: 'loading' });

  state = transitionModelRuntime(state, { type: 'load-success', id: 'model-a' });
  assert.equal(state.phase, 'loaded');

  state = transitionModelRuntime(state, { type: 'load-success', id: 'model-a', backendLabel: 'GPU · OpenCL' });
  assert.equal(state.backendLabel, 'GPU · OpenCL');

  state = transitionModelRuntime(state, { type: 'unloaded', id: 'model-a' });
  assert.deepEqual({ modelId: state.modelId, phase: state.phase }, { modelId: null, phase: 'idle' });
  assert.equal(state.backendLabel, undefined);

  state = transitionModelRuntime(state, { type: 'load-start', id: 'model-a' });
  state = transitionModelRuntime(state, { type: 'load-failure', id: 'model-a', error: 'Insufficient memory' });
  assert.equal(state.phase, 'error');
  assert.equal(state.error, 'Insufficient memory');
});

test('does not let a pending load replace a model being removed', () => {
  let state = transitionModelRuntime(initialModelRuntime, { type: 'load-start', id: 'model-a' });
  state = transitionModelRuntime(state, { type: 'remove-start', id: 'model-a' });
  assert.equal(canLoadModel(state, 'model-a'), false);
  state = transitionModelRuntime(state, { type: 'load-success', id: 'model-a' });
  assert.equal(state.phase, 'idle');
  assert.deepEqual(state.removing, ['model-a']);

  state = transitionModelRuntime(state, { type: 'remove-failure', id: 'model-a' });
  assert.deepEqual(state.removing, []);
  assert.equal(state.modelId, null);
  assert.equal(state.phase, 'idle');
  assert.equal(state.error, undefined);
});

test('allows loading a different model while another model is being removed', () => {
  const removing = transitionModelRuntime(initialModelRuntime, { type: 'remove-start', id: 'model-a' });
  assert.equal(canLoadModel(removing, 'model-a'), false);
  assert.equal(canLoadModel(removing, 'model-b'), true);
});

test('unloads all models by default but scopes deletion cleanup to the matching model', () => {
  assert.equal(shouldUnloadModel('model-a'), true);
  assert.equal(shouldUnloadModel('model-a', 'model-a'), true);
  assert.equal(shouldUnloadModel('model-a', 'model-b'), false);
  assert.equal(shouldUnloadModel(null, 'model-b'), false);
});

test('keeps the active model intact when removal of a different model fails', () => {
  let state = transitionModelRuntime(initialModelRuntime, { type: 'load-start', id: 'model-a' });
  state = transitionModelRuntime(state, { type: 'load-success', id: 'model-a' });
  state = transitionModelRuntime(state, { type: 'remove-start', id: 'model-b' });
  state = transitionModelRuntime(state, { type: 'remove-failure', id: 'model-b' });

  assert.equal(state.modelId, 'model-a');
  assert.equal(state.phase, 'loaded');
  assert.deepEqual(state.removing, []);
});

test('does not replace a newly loaded model with the one whose removal failed', () => {
  let state = transitionModelRuntime(initialModelRuntime, { type: 'load-start', id: 'model-a' });
  state = transitionModelRuntime(state, { type: 'load-success', id: 'model-a' });
  state = transitionModelRuntime(state, { type: 'remove-start', id: 'model-a' });
  state = transitionModelRuntime(state, { type: 'load-start', id: 'model-b' });
  state = transitionModelRuntime(state, { type: 'load-success', id: 'model-b' });
  state = transitionModelRuntime(state, { type: 'remove-failure', id: 'model-a' });

  assert.equal(state.modelId, 'model-b');
  assert.equal(state.phase, 'loaded');
  assert.deepEqual(state.removing, []);
});

test('clears removal state after successful deletion', () => {
  let state = transitionModelRuntime(initialModelRuntime, { type: 'remove-start', id: 'model-a' });
  state = transitionModelRuntime(state, { type: 'remove-success', id: 'model-a' });
  assert.deepEqual(state, initialModelRuntime);
});
