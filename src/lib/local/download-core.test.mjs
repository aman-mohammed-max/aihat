import assert from 'node:assert/strict';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fillSafeHttpsTemplate, isSafeHttpsUrl, normalizeModelDescription, normalizeRepoMetadata, parseSiteOrigin, resolveSafeSiteUrl } from './market-core.mjs';
import { assessModelMemory, fitModel, modelCapacity, needs, safeContextSize } from './fit-core.mjs';
import { gzipSync, zipSync } from 'fflate';
import { gunzipBounded, normalizeArchivePath, readBoundedJson, readBoundedResponse, unpackSafe, untarSafe } from '../market-safety.mjs';
import {
  assertStorageCapacity,
  availableAfterReservations,
  checkedModelPath,
  checkedRepo,
  createDownloadScheduler,
  finishDownloadTask,
  fileUrl,
  findLegacyModelAliases,
  modelStorageSegments,
  pausedDownloadReservations,
  recoverAtomicFile,
  recoverAtomicFileSync,
  promoteVerifiedDownload,
  recoverDownloadJob,
  recoverInterruptedPromotion,
  validateDownloadedModel,
  validateDownloadedPart,
  writeAtomicFile,
  writeAtomicFileSync,
} from './download-core.mjs';

test('builds an encoded HTTPS Hugging Face download URL', () => {
  assert.equal(fileUrl('owner/model', 'folder/model Q4.gguf'), 'https://huggingface.co/owner/model/resolve/main/folder/model%20Q4.gguf?download=true');
  assert.equal(fileUrl('owner/model', 'model.gguf', '0123456789abcdef'), 'https://huggingface.co/owner/model/resolve/0123456789abcdef/model.gguf?download=true');
});

test('rejects malformed repositories and traversal paths', () => {
  assert.throws(() => checkedRepo('owner/../model'), /invalid/);
  assert.throws(() => checkedRepo('https://example.com/model'), /invalid/);
  assert.throws(() => checkedModelPath('../escape.gguf'), /invalid/);
  assert.throws(() => checkedModelPath('folder\\escape.gguf'), /invalid/);
  assert.throws(() => checkedModelPath('/absolute.gguf'), /invalid/);
  assert.throws(() => fileUrl('owner/model', 'model.gguf', '../main'), /revision is invalid/);
});

test('encodes nested model paths distinctly across case-insensitive and Unicode-normalizing filesystems', () => {
  const nested = modelStorageSegments('owner/repo/folder/model.gguf');
  const flatName = modelStorageSegments('owner/repo/folder__model.gguf');
  assert.equal(nested[0], 'files');
  assert.notDeepEqual(nested, flatName);
  assert.notDeepEqual(modelStorageSegments('Owner/repo/model.gguf'), modelStorageSegments('owner/repo/model.gguf'));
  assert.notDeepEqual(modelStorageSegments('owner/repo/café.gguf'), modelStorageSegments('owner/repo/cafe\u0301.gguf'));
  assert.ok(modelStorageSegments(`owner/repo/${'x'.repeat(512)}.gguf`).every((segment) => segment.length < 255));
  assert.throws(() => modelStorageSegments('owner/repo/folder/../model.gguf'), /invalid/);
  assert.throws(() => modelStorageSegments('https://host/repo/model.gguf'), /invalid/);
  assert.throws(() => modelStorageSegments(`owner/repo/${String.fromCharCode(0xd800)}.gguf`), /invalid/);
});

test('resolves legacy model paths only for indexed files without a new hierarchical file', () => {
  const models = [
    { id: 'owner/repo/folder/model.gguf' },
    { id: 'owner/repo/folder__model.gguf' },
    { id: 'owner/repo/new/model.gguf' },
  ];
  const canonical = new Set(['owner/repo/new/model.gguf']);
  const legacy = new Set(models.map(({ id }) => id));
  assert.deepEqual(findLegacyModelAliases(models, {
    canonicalExists: (id) => canonical.has(id),
    legacyExists: (id) => legacy.has(id),
  }), ['owner/repo/folder/model.gguf', 'owner/repo/folder__model.gguf']);
});

test('verifies speech model part sizes and publisher SHA-256 checksums', () => {
  const digest = 'ab'.repeat(32);
  assert.doesNotThrow(() => validateDownloadedPart({ size: 128, expectedSize: 128, sha256: digest, expectedSha256: digest }));
  assert.throws(() => validateDownloadedPart({ size: 127, expectedSize: 128, sha256: digest, expectedSha256: digest }), /incomplete/);
  assert.throws(() => validateDownloadedPart({ size: 128, expectedSize: 128, sha256: 'cd'.repeat(32), expectedSha256: digest }), /SHA-256/);
  assert.throws(() => validateDownloadedPart({ size: 128, expectedSize: 128, sha256: digest, expectedSha256: 'bad' }), /SHA-256/);
});

test('marketplace shows only architecture, parameter, license, and revision metadata provided by the publisher', () => {
  assert.deepEqual(normalizeRepoMetadata({
    config: { model_type: 'qwen3', num_parameters: 4_000_000_000 },
    cardData: { license: 'apache-2.0' },
    sha: '0123456789abcdef',
  }), {
    architecture: 'qwen3', parameters: 4_000_000_000, license: 'apache-2.0', revision: '0123456789abcdef',
  });
  assert.deepEqual(normalizeRepoMetadata({ id: 'publisher/7B-model' }), {});
});

test('sums publisher Safetensors parameter counts and rejects malformed values', () => {
  assert.deepEqual(normalizeRepoMetadata({
    config: { architectures: ['LlamaForCausalLM'] },
    safetensors: { parameters: { BF16: 1_000_000, F16: 2_000_000 } },
    sha: 'not-a-revision',
  }), { architecture: 'LlamaForCausalLM', parameters: 3_000_000 });
  assert.deepEqual(normalizeRepoMetadata({ safetensors: { parameters: { BF16: Number.MAX_VALUE } } }), {});
});

test('renders a short inert description excerpt from an untrusted publisher model card', () => {
  const description = normalizeModelDescription('---\nlicense: apache-2.0\n---\n# Model\n\nA plain description with [a link](https://example.com) and <script>alert(1)</script>.');
  assert.match(description, /^A plain description with a link and/);
  assert.doesNotMatch(description, /<script>|https:\/\//);
  assert.equal(normalizeModelDescription('# Title\n\nshort'), undefined);
});

test('MCP registry URLs require HTTPS without embedded credentials', () => {
  assert.equal(isSafeHttpsUrl('https://example.com/mcp'), true);
  assert.equal(isSafeHttpsUrl('http://example.com/mcp'), false);
  assert.equal(isSafeHttpsUrl('https://user:secret@example.com/mcp'), false);
  assert.equal(isSafeHttpsUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpsUrl('https://{tenant}.example.com/mcp', true), true);
});

test('MCP URL variables are escaped and cannot replace the server host', () => {
  assert.equal(fillSafeHttpsTemplate('https://example.com/{path}?key={token}', { path: 'a/b', token: 'x y' }), 'https://example.com/a%2Fb?key=x%20y');
  assert.throws(() => fillSafeHttpsTemplate('https://{tenant}.example.com/mcp', { tenant: 'attacker.example' }), /host name/);
  assert.throws(() => fillSafeHttpsTemplate('http://example.com/mcp', {}), /HTTPS/);
});

test('website skill discovery accepts HTTPS origins and rejects insecure or credential-bearing addresses', () => {
  assert.equal(parseSiteOrigin('docs.example.com/skills'), 'https://docs.example.com');
  assert.equal(parseSiteOrigin('https://docs.example.com/skills/'), 'https://docs.example.com');
  assert.equal(parseSiteOrigin('http://docs.example.com/skills'), null);
  assert.equal(parseSiteOrigin('https://user:secret@docs.example.com'), null);
  assert.equal(parseSiteOrigin('https://github.com/owner/repo'), null);
  assert.equal(parseSiteOrigin('javascript:alert(1)'), null);
});

test('publisher skill file URLs resolve safely and reject insecure schemes or embedded credentials', () => {
  assert.equal(resolveSafeSiteUrl('./files/skill.tgz', 'https://docs.example.com/.well-known/skills/index.json'), 'https://docs.example.com/.well-known/skills/files/skill.tgz');
  assert.equal(resolveSafeSiteUrl('https://cdn.example.com/skill.tgz', 'https://docs.example.com/index.json'), 'https://cdn.example.com/skill.tgz');
  assert.equal(resolveSafeSiteUrl('http://cdn.example.com/skill.tgz', 'https://docs.example.com/index.json'), null);
  assert.equal(resolveSafeSiteUrl('file:///etc/passwd', 'https://docs.example.com/index.json'), null);
  assert.equal(resolveSafeSiteUrl('https://user:secret@cdn.example.com/file', 'https://docs.example.com/index.json'), null);
});

test('caps streaming marketplace downloads while reading and rejects unknown-length non-streaming responses', async () => {
  const response = new Response(new Uint8Array([1, 2, 3, 4]));
  assert.deepEqual([...await readBoundedResponse(response, 4)], [1, 2, 3, 4]);
  await assert.rejects(readBoundedResponse(new Response(new Uint8Array([1, 2, 3, 4])), 3), /too large/);
  const legacyResponse = { headers: new Headers(), body: null, arrayBuffer: async () => new Uint8Array(4).buffer };
  await assert.rejects(readBoundedResponse(legacyResponse, 8), /safe download size/);
});

test('parses bounded JSON responses and rejects oversized or malformed JSON', async () => {
  assert.deepEqual(await readBoundedJson(new Response('{"skills":[]}'), 32), { skills: [] });
  await assert.rejects(readBoundedJson(new Response('{"skills":[]}'), 8), /too large/);
  await assert.rejects(readBoundedJson(new Response('{broken'), 32), /invalid JSON/);
});

test('stops gzip expansion at the configured limit and accepts valid bounded archives', () => {
  const compressed = gzipSync(new TextEncoder().encode('safe skill archive'));
  assert.equal(new TextDecoder().decode(gunzipBounded(compressed, 100)), 'safe skill archive');
  const bomb = gzipSync(new Uint8Array(100_000));
  assert.throws(() => gunzipBounded(bomb, 1024), /too large/);
});

test('parses a valid skill tar and rejects traversal, negative sizes, bad checksums, and truncated bodies', () => {
  const valid = makeTar('SKILL.md', new TextEncoder().encode('---\nname: sample\n---\nInstructions'));
  assert.equal(untarSafe(valid)[0].path, 'SKILL.md');
  assert.throws(() => untarSafe(makeTar('../SKILL.md', new Uint8Array([1]))), /unsafe path/);
  const negativeSize = makeTar('file.txt', new Uint8Array([1]));
  negativeSize.set(new TextEncoder().encode('-000001'), 124);
  writeTarChecksum(negativeSize);
  assert.throws(() => untarSafe(negativeSize), /invalid file size/);
  const corruptHeader = makeTar('file.txt', new Uint8Array([1]));
  corruptHeader[0] ^= 1;
  assert.throws(() => untarSafe(corruptHeader), /damaged header/);
  assert.throws(() => untarSafe(valid.subarray(0, 512)), /incomplete/);
});

test('normalizes only safe archive member paths', () => {
  assert.equal(normalizeArchivePath('./docs/guide.md'), 'docs/guide.md');
  for (const path of ['../escape', '/absolute', 'C:\\escape', 'folder\\file', 'a/../b', 'a//b', 'nul\0path', 'line\nfeed']) {
    assert.equal(normalizeArchivePath(path), null);
  }
});

test('unpacks plain tar, gzip tar, and zip while enforcing ZIP paths and aggregate output size', () => {
  const tar = makeTar('SKILL.md', new TextEncoder().encode('instructions'));
  const gzipTar = gzipSync(tar);
  const zip = zipSync({ 'SKILL.md': new TextEncoder().encode('instructions') });
  assert.equal(new TextDecoder().decode(unpackSafe(tar)[0].data), 'instructions');
  assert.equal(new TextDecoder().decode(unpackSafe(gzipTar)[0].data), 'instructions');
  assert.equal(new TextDecoder().decode(unpackSafe(zip)[0].data), 'instructions');
  assert.throws(() => unpackSafe(zipSync({ '../escape.txt': new Uint8Array([1]) })), /unsafe path/);
  const medium = new Uint8Array(600_000);
  assert.throws(() => unpackSafe(zipSync({ 'one.txt': medium, 'two.txt': medium }), 1_000_000), /too large/);
});

test('model fit remains unknown without device memory and is more conservative on iOS', () => {
  assert.equal(fitModel(1_000_000_000, 0, 'android'), 'unknown');
  assert.equal(fitModel(1_600_000_000, 8_000_000_000, 'ios'), 'ok');
  assert.equal(fitModel(1_600_000_000, 8_000_000_000, 'android'), 'good');
  assert.equal(fitModel(0, 8_000_000_000, 'android'), 'unknown');
});

test('safe context tiers shrink as model size grows and use a conservative unknown default', () => {
  assert.equal(safeContextSize(undefined, 2_000_000_000), 1024);
  assert.equal(safeContextSize(8_000_000_000, 1_000_000_000), 2048);
  assert.equal(safeContextSize(8_000_000_000, 0), 4096);
  assert.equal(safeContextSize(16_000_000_000, 0), 8192);
  assert.equal(safeContextSize(32_000_000_000, 0), 8192);
  assert.ok(needs(2_000_000_000) > 2_000_000_000);
});

test('device capacity recommendations are ordered and unavailable without memory', () => {
  assert.equal(modelCapacity(Number.NaN, 'ios'), null);
  const capacity = modelCapacity(8_000_000_000, 'ios');
  assert.ok(capacity.good <= capacity.ok);
});

test('model load preflight uses available memory and Android low-memory state', () => {
  const base = { modelSize: 1_000_000_000, totalMemory: 8_000_000_000, platform: 'android' };
  assert.deepEqual(assessModelMemory({ ...base, availableMemory: 4_000_000_000, lowMemory: false }), {
    allowed: true, reason: null, contextSize: 2048,
  });
  assert.equal(assessModelMemory({ ...base, availableMemory: 4_000_000_000, lowMemory: true }).reason, 'low-memory');
  assert.equal(assessModelMemory({ ...base, availableMemory: 1_000_000_000, lowMemory: false }).reason, 'available-memory');
  assert.equal(assessModelMemory({ ...base, availableMemory: 0, lowMemory: false }).reason, 'available-memory');
});

test('iOS model load preflight uses current process memory headroom when available', () => {
  const base = { modelSize: 1_000_000_000, totalMemory: 8_000_000_000, platform: 'ios' };
  assert.equal(assessModelMemory({ ...base, availableMemory: 4_000_000_000 }).allowed, true);
  assert.equal(assessModelMemory({ ...base, availableMemory: 1_000_000_000 }).reason, 'available-memory');
  assert.equal(assessModelMemory({ ...base, availableMemory: 0 }).reason, 'available-memory');
  assert.equal(assessModelMemory({ ...base }).allowed, true);
});

test('model load preflight falls back to total memory and blocks estimates beyond device capacity', () => {
  const safe = assessModelMemory({ modelSize: 1_000_000_000, totalMemory: 8_000_000_000, platform: 'android' });
  assert.equal(safe.allowed, true);
  assert.equal(safe.contextSize, 2048);

  const tooLarge = assessModelMemory({ modelSize: 4_000_000_000, totalMemory: 4_000_000_000, platform: 'android' });
  assert.equal(tooLarge.allowed, false);
  assert.equal(tooLarge.reason, 'model-too-large');

  const noSnapshot = assessModelMemory({ modelSize: 0, totalMemory: 0 });
  assert.equal(noSnapshot.allowed, true);
  assert.equal(noSnapshot.contextSize, 1024);
});

test('accepts exact-size GGUF and rejects truncation, checksum mismatch, and bad magic', () => {
  const checksum = 'a'.repeat(64);
  assert.doesNotThrow(() => validateDownloadedModel({ size: 4, expectedSize: 4, sha256: checksum, expectedSha256: checksum, magic: 'GGUF' }));
  assert.throws(() => validateDownloadedModel({ size: 3, magic: 'GGUF' }), /empty or incomplete/);
  assert.throws(() => validateDownloadedModel({ size: 4, expectedSize: 5, magic: 'GGUF' }), /incomplete/);
  assert.throws(() => validateDownloadedModel({ size: 4, sha256: 'b'.repeat(64), expectedSha256: checksum, magic: 'GGUF' }), /SHA-256/);
  assert.throws(() => validateDownloadedModel({ size: 4, magic: 'HTML' }), /GGUF/);
});

test('rejects insufficient storage while tolerating unavailable free-space metadata', () => {
  assert.doesNotThrow(() => assertStorageCapacity(1_000, 400_000_000));
  assert.throws(() => assertStorageCapacity(1_000, 1_000, 300), /Not enough free space/);
  assert.doesNotThrow(() => assertStorageCapacity(1_000, 0));
});

test('reserves remaining bytes for active and paused downloads before starting another model', () => {
  assert.equal(availableAfterReservations(2_000_000_000, 600_000_000), 1_400_000_000);
  assert.equal(availableAfterReservations(1_000_000_000, 1_200_000_000), 0);
  assert.equal(availableAfterReservations(0, 1_200_000_000), 0);
  assert.throws(() => assertStorageCapacity(1_000_000_000, availableAfterReservations(1_800_000_000, 600_000_000)), /Not enough free space/);
  assert.doesNotThrow(() => assertStorageCapacity(1_000_000_000, availableAfterReservations(1_900_000_000, 600_000_000)));
  const paused = {
    first: { id: 'first', state: 'paused', size: 1_000_000_000, written: 250_000_000 },
    active: { id: 'active', state: 'active', size: 2_000_000_000, written: 800_000_000 },
    finished: { id: 'finished', state: 'failed', size: 3_000_000_000, written: 3_000_000_000 },
  };
  assert.equal(pausedDownloadReservations(paused, 'second'), 750_000_000);
  assert.equal(pausedDownloadReservations(paused, 'first'), 0);
});

test('limits native transfers, preserves FIFO order, and cancels queued work without starting it', async () => {
  const scheduler = createDownloadScheduler(2);
  const started = [];
  const finish = new Map();
  const enqueue = (id) => scheduler.enqueue(id, () => new Promise((resolve) => {
    started.push(id);
    finish.set(id, resolve);
  }));
  const first = enqueue('first');
  const second = enqueue('second');
  const cancelled = enqueue('cancelled');
  const fourth = enqueue('fourth');
  await new Promise(setImmediate);
  assert.deepEqual(started, ['first', 'second']);
  assert.equal(scheduler.isQueued('cancelled'), true);
  assert.equal(scheduler.cancel('cancelled'), true);
  await cancelled;
  finish.get('first')();
  await new Promise(setImmediate);
  assert.deepEqual(started, ['first', 'second', 'fourth']);
  finish.get('second')();
  finish.get('fourth')();
  await Promise.all([first, second, fourth]);
  assert.equal(scheduler.cancel('missing'), false);
});

test('releases a scheduler slot when a transfer fails', async () => {
  const scheduler = createDownloadScheduler(1);
  const started = [];
  const failed = scheduler.enqueue('failed', async () => {
    started.push('failed');
    throw new Error('network failed');
  });
  const next = scheduler.enqueue('next', () => { started.push('next'); });
  await assert.rejects(failed, /network failed/);
  await next;
  assert.deepEqual(started, ['failed', 'next']);
});

test('recovers explicitly paused jobs and marks interrupted active jobs retryable with partial bytes', () => {
  const job = { id: 'model', written: 25, state: 'active' };
  assert.deepEqual(recoverDownloadJob(job, true, 40), { id: 'model', written: 40, state: 'paused', error: undefined });
  assert.deepEqual(recoverDownloadJob(job, false, 12), {
    id: 'model', written: 12, state: 'failed', error: 'The app restarted before this download finished. Retry to continue.',
  });
});

test('restores queued jobs without treating stale partial bytes as resumable progress', () => {
  const job = { id: 'model', size: 100, written: 30, queuedAt: 123, state: 'queued' };
  assert.deepEqual(recoverDownloadJob(job, false, 80), { ...job, written: 0, state: 'queued', error: undefined });
});

test('recovers a completed background transfer whose JavaScript task was lost as ready for verification', () => {
  const job = { id: 'model', size: 4096, written: 3072, state: 'active' };
  assert.deepEqual(recoverDownloadJob(job, false, 4096), { ...job, written: 4096, state: 'verifying', error: undefined });
  assert.equal(recoverDownloadJob(job, false, 4095).state, 'failed');
  assert.equal(recoverDownloadJob(job, true, 4096).state, 'paused');
});

test('acknowledges a completed iOS background download after processing, before releasing its handle', async () => {
  const events = [];
  await finishDownloadTask({
    state: 'completed',
    async acknowledgeBackgroundCompletionAsync() { events.push('acknowledge'); },
    release() { events.push('release'); },
  }, 'ios');
  assert.deepEqual(events, ['acknowledge', 'release']);
});

test('releases completed Android downloads without using the iOS background acknowledgment', async () => {
  const events = [];
  await finishDownloadTask({
    state: 'completed',
    async acknowledgeBackgroundCompletionAsync() { events.push('unexpected-acknowledgment'); },
    release() { events.push('release'); },
  }, 'android');
  assert.deepEqual(events, ['release']);
});

test('keeps a paused download handle available for resume', async () => {
  let released = false;
  await finishDownloadTask({
    state: 'paused',
    async acknowledgeBackgroundCompletionAsync() { assert.fail('paused task cannot acknowledge completion'); },
    release() { released = true; },
  }, 'ios');
  assert.equal(released, false);
});

test('releases an iOS task even if the background completion acknowledgment fails', async () => {
  let released = false;
  await finishDownloadTask({
    state: 'completed',
    async acknowledgeBackgroundCompletionAsync() { throw new Error('ack failed'); },
    release() { released = true; },
  }, 'ios');
  assert.equal(released, true);
});

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aihat-model-install-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return Object.fromEntries(['part', 'target', 'backup', 'next'].map((name) => [name, path.join(dir, name)]));
}

function fileOps() {
  return {
    exists: async (p) => { try { await readFile(p); return true; } catch { return false; } },
    move: async (from, to) => { const { rename } = await import('node:fs/promises'); await rename(from, to); },
    remove: async (p) => rm(p, { force: true }),
  };
}

test('promotes a verified download and removes the old version only after commit', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.part, 'new model');
  await writeFile(paths.target, 'old model');
  let commitSawNewTarget = false;
  const ops = fileOps();

  await promoteVerifiedDownload({ ...paths, ...ops, commit: async () => { commitSawNewTarget = (await readFile(paths.target, 'utf8')) === 'new model'; } });

  assert.equal(commitSawNewTarget, true);
  assert.equal(await readFile(paths.target, 'utf8'), 'new model');
  assert.equal(await ops.exists(paths.backup), false);
});

test('releases a loaded model before replacing its on-disk file', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.part, 'new model');
  await writeFile(paths.target, 'loaded old model');
  const ops = fileOps();
  const events = [];

  await promoteVerifiedDownload({
    ...paths,
    ...ops,
    beforePromote: async () => {
      assert.equal(await readFile(paths.target, 'utf8'), 'loaded old model');
      events.push('released');
    },
    move: async (from, to) => {
      events.push('move');
      await ops.move(from, to);
    },
    commit: () => events.push('commit'),
  });

  assert.equal(events[0], 'released');
  assert.equal(await readFile(paths.target, 'utf8'), 'new model');
});

test('restores the previous model if index commit fails', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.part, 'new model');
  await writeFile(paths.target, 'old model');
  const ops = fileOps();

  await assert.rejects(promoteVerifiedDownload({ ...paths, ...ops, commit: () => { throw new Error('index unavailable'); } }), /index unavailable/);

  assert.equal(await readFile(paths.target, 'utf8'), 'old model');
  assert.equal(await ops.exists(paths.backup), false);
  assert.equal(await readFile(paths.part, 'utf8'), 'new model');
});

test('does not overwrite a backup left by an interrupted install', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.part, 'new model');
  await writeFile(paths.backup, 'previous model');
  const ops = fileOps();

  await assert.rejects(promoteVerifiedDownload({ ...paths, ...ops, commit: () => {} }), /needs recovery/);

  assert.equal(await readFile(paths.backup, 'utf8'), 'previous model');
  assert.equal(await readFile(paths.part, 'utf8'), 'new model');
});

test('recovers an interrupted promotion to its previous model before retrying', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.target, 'new model');
  await writeFile(paths.backup, 'old model');
  const ops = fileOps();

  const outcome = await recoverInterruptedPromotion({ ...paths, indexed: false, ...ops });

  assert.equal(outcome, 'retry');
  assert.equal(await readFile(paths.target, 'utf8'), 'old model');
  assert.equal(await ops.exists(paths.backup), false);
});

test('cleans the transaction backup after an indexed install is committed', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.target, 'installed model');
  await writeFile(paths.backup, 'old model');
  const ops = fileOps();

  const outcome = await recoverInterruptedPromotion({ ...paths, indexed: true, ...ops });

  assert.equal(outcome, 'committed');
  assert.equal(await readFile(paths.target, 'utf8'), 'installed model');
  assert.equal(await ops.exists(paths.backup), false);
});

const validJson = async (file) => {
  try { return Array.isArray(JSON.parse(await readFile(file, 'utf8'))); } catch { return false; }
};

test('writes index JSON through a verified staging file and removes its backup', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.target, '["old"]');
  const ops = fileOps();

  await writeAtomicFile({
    ...paths, content: '["new"]', ...ops, isValid: validJson,
    write: (file, content) => writeFile(file, content),
  });

  assert.deepEqual(JSON.parse(await readFile(paths.target, 'utf8')), ['new']);
  assert.equal(await ops.exists(paths.backup), false);
  assert.equal(await ops.exists(paths.next), false);
});

test('recovers the old index when a crash happens between backup and promotion', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.backup, '["old"]');
  await writeFile(paths.next, '["new"]');
  const ops = fileOps();

  const outcome = await recoverAtomicFile({ ...paths, ...ops, isValid: validJson });

  assert.equal(outcome, 'restored');
  assert.deepEqual(JSON.parse(await readFile(paths.target, 'utf8')), ['old']);
  assert.equal(await ops.exists(paths.backup), false);
  assert.equal(await ops.exists(paths.next), false);
});

test('keeps a valid committed index and cleans stale transaction files', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.target, '["new"]');
  await writeFile(paths.backup, '["old"]');
  await writeFile(paths.next, '{partial');
  const ops = fileOps();

  const outcome = await recoverAtomicFile({ ...paths, ...ops, isValid: validJson });

  assert.equal(outcome, 'current');
  assert.deepEqual(JSON.parse(await readFile(paths.target, 'utf8')), ['new']);
  assert.equal(await ops.exists(paths.backup), false);
  assert.equal(await ops.exists(paths.next), false);
});

test('promotes a complete initial index if the process stops before its first rename', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.next, '["installed"]');
  const ops = fileOps();

  const outcome = await recoverAtomicFile({ ...paths, ...ops, isValid: validJson });

  assert.equal(outcome, 'promoted');
  assert.deepEqual(JSON.parse(await readFile(paths.target, 'utf8')), ['installed']);
});

test('synchronously commits small recovery state only after the staged JSON is valid', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.target, '{"old":true}');
  const ops = syncFileOps();

  writeAtomicFileSync({
    ...paths, content: '{"new":true}', ...ops, isValid: validObjectJson,
    write: (file, content) => writeFileSync(file, content),
  });

  assert.deepEqual(JSON.parse(readFileSync(paths.target, 'utf8')), { new: true });
  assert.equal(ops.exists(paths.backup), false);
});

test('keeps the last good recovery record when staging produces malformed JSON', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.target, '{"old":true}');
  const ops = syncFileOps();

  assert.throws(() => writeAtomicFileSync({
    ...paths, content: '{partial', ...ops, isValid: validObjectJson,
    write: (file, content) => writeFileSync(file, content),
  }), /could not be verified/);

  assert.deepEqual(JSON.parse(readFileSync(paths.target, 'utf8')), { old: true });
});

test('synchronously restores saved recovery state after an interrupted replacement', async (t) => {
  const paths = await fixture(t);
  await writeFile(paths.backup, '{"old":true}');
  await writeFile(paths.next, '{"new":true}');
  const ops = syncFileOps();

  const outcome = recoverAtomicFileSync({ ...paths, ...ops, isValid: validObjectJson });

  assert.equal(outcome, 'restored');
  assert.deepEqual(JSON.parse(readFileSync(paths.target, 'utf8')), { old: true });
});

function validObjectJson(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return !!value && typeof value === 'object' && !Array.isArray(value);
  } catch {
    return false;
  }
}

function syncFileOps() {
  return {
    exists: (file) => existsSync(file),
    move: (from, to) => renameSync(from, to),
    remove: (file) => rmSync(file, { force: true }),
  };
}

function makeTar(name, data) {
  const header = new Uint8Array(512);
  header.set(new TextEncoder().encode(name), 0);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, data.length);
  writeOctal(header, 136, 12, 0);
  header.fill(32, 148, 156);
  header[156] = 48;
  header.set(new TextEncoder().encode('ustar\0'), 257);
  header.set(new TextEncoder().encode('00'), 263);
  writeTarChecksum(header);
  const padding = new Uint8Array((512 - (data.length % 512)) % 512);
  const end = new Uint8Array(1024);
  const tar = new Uint8Array(header.length + data.length + padding.length + end.length);
  tar.set(header);
  tar.set(data, header.length);
  tar.set(padding, header.length + data.length);
  tar.set(end, header.length + data.length + padding.length);
  return tar;
}

function writeOctal(bytes, offset, length, value) {
  const digits = value.toString(8).padStart(length - 1, '0');
  bytes.set(new TextEncoder().encode(digits), offset);
  bytes[offset + length - 1] = 0;
}

function writeTarChecksum(header) {
  header.fill(32, 148, 156);
  let checksum = 0;
  for (const byte of header.subarray(0, 512)) checksum += byte;
  const digits = checksum.toString(8).padStart(6, '0');
  header.set(new TextEncoder().encode(digits), 148);
  header[154] = 0;
  header[155] = 32;
}
