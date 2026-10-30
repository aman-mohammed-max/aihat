/** Validate the only persisted native download state: an explicitly paused Phonon part. */
export function createPhononResumeRecord(path, state, validPaths) {
  if (typeof path !== 'string' || !validPaths.includes(path) || !state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('The paused speech-model download state is invalid.');
  }
  return { version: 1, path, state };
}

/** Reject stale, malformed, or unknown-part state before passing it to Expo's native DownloadTask API. */
export function parsePhononResumeRecord(value, validPaths) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
  try {
    return createPhononResumeRecord(value.path, value.state, validPaths);
  } catch {
    return null;
  }
}

/** Count completed files and the first partial file in a sequential multi-file download. */
export function phononTransferProgress(parts, sizes) {
  let written = 0;
  for (const part of parts) {
    const size = Number.isSafeInteger(sizes[part.path]) && sizes[part.path] > 0 ? sizes[part.path] : 0;
    written += Math.min(size, part.size);
    if (size < part.size) break;
  }
  return written;
}
