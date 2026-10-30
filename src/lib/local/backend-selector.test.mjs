import assert from 'node:assert/strict';
import test from 'node:test';

import { actualBackend, accelerationFailureReason, createBackendPlan, ggufFileType, ggufQuantName } from './backend-selector.mjs';

const opencl = { backend: 'OpenCL', type: 'gpu', deviceName: 'Adreno 740' };
const htp = { backend: 'Hexagon', type: 'accel', deviceName: 'HTP0' };
const metal = { backend: 'Metal', type: 'gpu', deviceName: 'Apple GPU' };

test('reads GGUF file type from llama.rn metadata and identifies OpenCL-supported quants', () => {
  assert.equal(ggufFileType({ metadata: { 'general.file_type': '2' } }), 2);
  assert.equal(ggufFileType({ metadata: { 'general.file_type': 18 } }), 18);
  assert.equal(ggufQuantName(15), 'Q4_K_M');
  assert.equal(ggufFileType({ metadata: { 'general.file_type': 'mixed' } }), null);
});

test('Android automatic mode chooses OpenCL only for Q4_0 or Q6_K and otherwise uses CPU', () => {
  assert.deepEqual(createBackendPlan({ platform: 'android', devices: [opencl], modelInfo: { metadata: { 'general.file_type': 2 } } }).candidates.map((c) => c.kind), ['gpu', 'cpu']);
  const incompatible = createBackendPlan({ platform: 'android', devices: [opencl], modelInfo: { metadata: { 'general.file_type': 15 } } });
  assert.deepEqual(incompatible.candidates.map((c) => c.kind), ['cpu']);
  assert.match(incompatible.fallbackReason, /requires Q4_0 or Q6_K/);
});

test('Android NPU is opt-in and only offered when an HTP device is reported', () => {
  const noNpu = createBackendPlan({ platform: 'android', preference: 'npu', devices: [opencl] });
  assert.deepEqual(noNpu.candidates.map((c) => c.kind), ['cpu']);
  assert.match(noNpu.fallbackReason, /No Hexagon HTP NPU/);
  const withNpu = createBackendPlan({ platform: 'android', preference: 'npu', devices: [htp] });
  assert.deepEqual(withNpu.candidates.map((c) => c.kind), ['npu', 'cpu']);
  assert.deepEqual(withNpu.candidates[0].devices, ['HTP0']);
  assert.deepEqual(createBackendPlan({ platform: 'android', devices: [htp], modelInfo: { metadata: { 'general.file_type': 15 } } }).candidates.map((c) => c.kind), ['cpu']);
});

test('iOS uses Metal only when the runtime reports it and CPU remains available', () => {
  assert.deepEqual(createBackendPlan({ platform: 'ios', devices: [metal] }).candidates.map((c) => c.kind), ['gpu', 'cpu']);
  const unavailable = createBackendPlan({ platform: 'ios', preference: 'gpu', devices: [] });
  assert.deepEqual(unavailable.candidates.map((c) => c.kind), ['cpu']);
  assert.match(unavailable.fallbackReason, /No llama.cpp Metal GPU/);
  const noAppleNpu = createBackendPlan({ platform: 'ios', preference: 'npu', devices: [metal] });
  assert.deepEqual(noAppleNpu.candidates.map((c) => c.kind), ['cpu']);
  assert.match(noAppleNpu.fallbackReason, /does not expose an iOS Neural Engine/);
});

test('displayed backend follows context devices, not the selected preference', () => {
  const gpuCandidate = createBackendPlan({ platform: 'android', devices: [opencl], modelInfo: { metadata: { 'general.file_type': 2 } } }).candidates[0];
  assert.equal(actualBackend({ platform: 'android', candidate: gpuCandidate, context: { gpu: true, devices: ['Adreno 740'] } }).label, 'GPU · OpenCL');
  assert.equal(actualBackend({ platform: 'android', candidate: gpuCandidate, context: { gpu: false, devices: [], reasonNoGPU: 'not selected' } }).label, 'CPU');
  const npuCandidate = createBackendPlan({ platform: 'android', preference: 'npu', devices: [htp] }).candidates[0];
  assert.equal(actualBackend({ platform: 'android', candidate: npuCandidate, context: { gpu: false, devices: ['HTP0'] } }).kind, 'npu');
});

test('reports failed acceleration when it falls back', () => {
  assert.match(accelerationFailureReason({ label: 'GPU · OpenCL' }, new Error('unsupported model')), /could not load this model \(unsupported model\); using CPU/);
});
