const HF = 'https://huggingface.co';

function hexUtf8(value) {
  const bytes = [];
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === undefined || (code >= 0xd800 && code <= 0xdfff)) throw new Error('That local model address is invalid.');
    if (code <= 0x7f) bytes.push(code);
    else if (code <= 0x7ff) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code <= 0xffff) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function modelPathSegment(value, isFilename = false) {
  const hex = hexUtf8(value);
  if (hex.length <= 120) return [`s${hex}`];
  const chunks = hex.match(/.{1,120}/g) ?? [];
  return isFilename
    ? ['z', ...chunks.map((chunk) => `c${chunk}`), 'e', 'payload']
    : ['l', ...chunks.map((chunk) => `c${chunk}`), 'e'];
}

/** Return a collision-free on-disk hierarchy for a repository-relative model path. */
export function modelStorageSegments(id) {
  if (typeof id !== 'string' || id.length > 1024 || /[\\\u0000-\u001f]/.test(id)) {
    throw new Error('That local model address is invalid.');
  }
  const parts = id.split('/');
  if (parts.length < 3 || parts.slice(2).some((part) => !part || part === '.' || part === '..') ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(`${parts[0]}/${parts[1]}`)) {
    throw new Error('That local model address is invalid.');
  }
  return [
    'files',
    ...parts.slice(0, -1).flatMap((part) => modelPathSegment(part)),
    ...modelPathSegment(parts[parts.length - 1], true),
  ];
}

/** Keep older indexed flat files addressable while new installs use the hierarchical path. */
export function findLegacyModelAliases(models, { canonicalExists, legacyExists }) {
  return models
    .filter(({ id }) => !canonicalExists(id) && legacyExists(id))
    .map(({ id }) => id);
}

export function checkedRepo(repo) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)) {
    throw new Error('That Hugging Face model address is invalid.');
  }
  return repo.split('/').map(encodeURIComponent).join('/');
}

export function checkedModelPath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('That model file address is invalid.');
  }
  return path.split('/').map(encodeURIComponent).join('/');
}

export function checkedRevision(revision) {
  if (revision !== 'main' && !/^[0-9a-f]{7,64}$/i.test(revision)) throw new Error('That model revision is invalid.');
  return encodeURIComponent(revision);
}

export function fileUrl(repo, path, revision = 'main') {
  return `${HF}/${checkedRepo(repo)}/resolve/${checkedRevision(revision)}/${checkedModelPath(path)}?download=true`;
}

export function validateDownloadedModel({ size, expectedSize, sha256, expectedSha256, magic }) {
  if (!Number.isSafeInteger(size) || size < 4) throw new Error('The downloaded file is empty or incomplete. Try again.');
  if (expectedSize > 0 && size !== expectedSize) throw new Error('The downloaded file is incomplete. Try again.');
  if (expectedSha256) {
    if (!/^[0-9a-f]{64}$/i.test(expectedSha256) || sha256?.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new Error('The downloaded model failed its SHA-256 integrity check. Retry the download.');
    }
  }
  if (magic !== 'GGUF') throw new Error('This download is not a valid GGUF model file.');
}

export function validateDownloadedPart({ size, expectedSize, sha256, expectedSha256 }) {
  if (!Number.isSafeInteger(size) || size < 1 || size !== expectedSize) {
    throw new Error('The downloaded model part is incomplete. Try again.');
  }
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256) || sha256?.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error('The downloaded model part failed its SHA-256 integrity check. Retry the download.');
  }
}

export function assertStorageCapacity(modelSize, availableBytes, reserveBytes = 300_000_000) {
  if (modelSize > 0 && Number.isFinite(availableBytes) && availableBytes > 0 && availableBytes < modelSize + reserveBytes) {
    throw new Error('Not enough free space for this model and its installation reserve.');
  }
}

/** Free space already includes bytes written by active transfers; reserve only their not-yet-written bytes. */
export function availableAfterReservations(availableBytes, reservedBytes) {
  if (!Number.isFinite(availableBytes) || availableBytes <= 0) return availableBytes;
  const reserved = Number.isFinite(reservedBytes) && reservedBytes > 0 ? reservedBytes : 0;
  return Math.max(0, availableBytes - reserved);
}

export function pausedDownloadReservations(jobs, excludedId) {
  return Object.values(jobs).reduce((sum, job) => {
    if (!job || job.id === excludedId || job.state !== 'paused') return sum;
    return sum + Math.max(0, job.size - job.written);
  }, 0);
}

/** FIFO scheduler for native file transfers. Cancelling a queued item resolves it without starting its task. */
export function createDownloadScheduler(maxConcurrent) {
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) throw new Error('The download limit must be a positive integer.');
  const waiting = [];
  const running = new Set();
  const pump = () => {
    while (running.size < maxConcurrent && waiting.length) {
      const entry = waiting.shift();
      running.add(entry.id);
      Promise.resolve().then(entry.run).then(entry.resolve, entry.reject).finally(() => {
        running.delete(entry.id);
        pump();
      });
    }
  };
  return {
    enqueue(id, run) {
      if (running.has(id) || waiting.some((entry) => entry.id === id)) return Promise.reject(new Error('This model is already queued or downloading.'));
      return new Promise((resolve, reject) => {
        waiting.push({ id, run, resolve, reject });
        pump();
      });
    },
    cancel(id) {
      const index = waiting.findIndex((entry) => entry.id === id);
      if (index < 0) return false;
      const [entry] = waiting.splice(index, 1);
      entry.resolve();
      pump();
      return true;
    },
    isQueued(id) {
      return waiting.some((entry) => entry.id === id);
    },
  };
}

export function recoverDownloadJob(job, hasPausedTask, partialSize) {
  if (hasPausedTask) return { ...job, written: partialSize ?? job.written, state: 'paused', error: undefined };
  if (job.state === 'queued') return { ...job, written: 0, state: 'queued', error: undefined };
  if (Number.isSafeInteger(job.size) && job.size > 0 && partialSize === job.size) {
    return { ...job, written: partialSize, state: 'verifying', error: undefined };
  }
  return {
    ...job,
    written: partialSize ?? job.written,
    state: 'failed',
    error: 'The app restarted before this download finished. Retry to continue.',
  };
}

/** Acknowledge completed iOS background transfers after processing, then release their native handles. */
export async function finishDownloadTask(task, platform) {
  if (!task) return;
  try {
    if (platform === 'ios' && task.state === 'completed') {
      await task.acknowledgeBackgroundCompletionAsync();
    }
  } catch {
    // Expo applies a bounded timeout to the system callback; a failed acknowledgment must not undo an installed model.
  } finally {
    if (task.state !== 'paused') task.release();
  }
}

/** Resolve a promotion interrupted between the file rename and the installed-model index commit. */
export async function recoverInterruptedPromotion({ target, backup, part, indexed, exists, move, remove }) {
  const hasBackup = await exists(backup);
  if (indexed) {
    if (hasBackup) {
      try {
        await remove(backup);
      } catch {
        // The indexed model is already committed; stale backup cleanup is best effort.
      }
    }
    return 'committed';
  }
  if (hasBackup) {
    if (await exists(target)) await remove(target);
    await move(backup, target);
  } else if (!(await exists(part)) && await exists(target)) {
    await remove(target);
  }
  return 'retry';
}

/** Recover a small JSON file replaced through a same-directory staging file and backup. */
export async function recoverAtomicFile({ target, backup, next, exists, isValid, move, remove }) {
  const valid = async (file) => (await exists(file)) && await isValid(file);
  const bestEffortRemove = async (file) => {
    if (await exists(file)) {
      try {
        await remove(file);
      } catch {
        // A valid committed copy remains authoritative if cleanup is blocked.
      }
    }
  };

  if (await valid(target)) {
    await bestEffortRemove(backup);
    await bestEffortRemove(next);
    return 'current';
  }
  if (await valid(backup)) {
    if (await exists(target)) await remove(target);
    await move(backup, target);
    await bestEffortRemove(next);
    return 'restored';
  }
  if (await valid(next)) {
    if (await exists(target)) await remove(target);
    await move(next, target);
    await bestEffortRemove(backup);
    return 'promoted';
  }

  await bestEffortRemove(target);
  await bestEffortRemove(backup);
  await bestEffortRemove(next);
  return 'empty';
}

/** Stage and validate new contents before swapping them into place. */
export async function writeAtomicFile({ target, backup, next, content, write, exists, isValid, move, remove }) {
  if (await exists(backup)) {
    throw new Error('A previous file update needs recovery before a new update can start.');
  }
  await write(next, content);
  if (!(await isValid(next))) throw new Error('The staged file could not be verified.');

  const hadTarget = await exists(target);
  if (hadTarget) await move(target, backup);
  try {
    await move(next, target);
  } catch (error) {
    if (hadTarget && await exists(backup) && !(await exists(target))) await move(backup, target);
    throw error;
  }
  if (await exists(backup)) {
    try {
      await remove(backup);
    } catch {
      // The new target is committed; stale backup cleanup can happen on the next read.
    }
  }
}

/** Synchronous counterpart for tiny state files whose callers must know persistence finished before returning. */
export function recoverAtomicFileSync({ target, backup, next, exists, isValid, move, remove }) {
  const valid = (file) => exists(file) && isValid(file);
  const bestEffortRemove = (file) => {
    if (exists(file)) {
      try {
        remove(file);
      } catch {
        // A valid committed copy remains authoritative if cleanup is blocked.
      }
    }
  };

  if (valid(target)) {
    bestEffortRemove(backup);
    bestEffortRemove(next);
    return 'current';
  }
  if (valid(backup)) {
    if (exists(target)) remove(target);
    move(backup, target);
    bestEffortRemove(next);
    return 'restored';
  }
  if (valid(next)) {
    if (exists(target)) remove(target);
    move(next, target);
    bestEffortRemove(backup);
    return 'promoted';
  }

  bestEffortRemove(target);
  bestEffortRemove(backup);
  bestEffortRemove(next);
  return 'empty';
}

export function writeAtomicFileSync({ target, backup, next, content, write, exists, isValid, move, remove }) {
  if (exists(backup)) throw new Error('A previous file update needs recovery before a new update can start.');
  write(next, content);
  if (!isValid(next)) throw new Error('The staged file could not be verified.');

  const hadTarget = exists(target);
  if (hadTarget) move(target, backup);
  try {
    move(next, target);
  } catch (error) {
    if (hadTarget && exists(backup) && !exists(target)) move(backup, target);
    throw error;
  }
  if (exists(backup)) {
    try {
      remove(backup);
    } catch {
      // The new target is committed; stale backup cleanup can happen on the next read.
    }
  }
}

/** Promote a verified part file while keeping the old install available until the index commit succeeds. */
export async function promoteVerifiedDownload({ part, target, backup, exists, move, remove, beforePromote, commit }) {
  if (await exists(backup)) throw new Error('A previous model installation needs recovery before a new install can start.');
  await beforePromote?.();
  const hadTarget = await exists(target);
  if (hadTarget) await move(target, backup);
  try {
    await move(part, target);
    await commit();
  } catch (error) {
    if (await exists(target)) await move(target, part);
    if (hadTarget && await exists(backup)) await move(backup, target);
    throw error;
  }
  if (await exists(backup)) {
    try {
      await remove(backup);
    } catch {
      // The verified target and committed index take precedence over leftover backup cleanup.
    }
  }
}
