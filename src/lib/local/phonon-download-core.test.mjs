import assert from 'node:assert/strict';
import test from 'node:test';

import { createPhononResumeRecord, parsePhononResumeRecord, phononTransferProgress } from './phonon-download-core.mjs';

const paths = ['manifest.json', 'decoder.bin', 'weight.bin'];

test('round-trips resume state only for a known speech-model part', () => {
  const state = { resumeData: 'synthetic-resume-data', url: 'https://huggingface.co/model/weight.bin' };
  const record = createPhononResumeRecord('weight.bin', state, paths);
  assert.deepEqual(parsePhononResumeRecord(JSON.parse(JSON.stringify(record)), paths), record);
});

test('rejects unknown, malformed, and old-version resume records', () => {
  const state = { resumeData: 'synthetic-resume-data' };
  assert.equal(parsePhononResumeRecord({ version: 1, path: '../outside', state }, paths), null);
  assert.equal(parsePhononResumeRecord({ version: 2, path: paths[0], state }, paths), null);
  assert.equal(parsePhononResumeRecord({ version: 1, path: paths[0], state: [] }, paths), null);
  assert.throws(() => createPhononResumeRecord(paths[0], null, paths), /state is invalid/);
});

test('restored progress includes complete parts and only the first partial part', () => {
  const parts = [
    { path: paths[0], size: 10 },
    { path: paths[1], size: 100 },
    { path: paths[2], size: 200 },
  ];
  assert.equal(phononTransferProgress(parts, { [paths[0]]: 10, [paths[1]]: 42, [paths[2]]: 180 }), 52);
  assert.equal(phononTransferProgress(parts, { [paths[0]]: 50, [paths[1]]: 100, [paths[2]]: -1 }), 110);
  assert.equal(phononTransferProgress(parts, {}), 0);
});
