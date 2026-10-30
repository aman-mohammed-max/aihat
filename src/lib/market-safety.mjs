import { Gunzip, unzipSync } from 'fflate';

export function normalizeArchivePath(path) {
  if (typeof path !== 'string' || !path || /[\u0000-\u001f\u007f]/.test(path) || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return null;
  const normalized = path.replace(/^\.\//, '');
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return normalized;
}

/** Parse a bounded tar buffer and reject malformed headers, truncated bodies, and unsafe member paths. */
export function untarSafe(tar) {
  const out = [];
  const decoder = new TextDecoder();
  const str = (from, to) => decoder.decode(tar.subarray(from, to)).replace(/\0.*$/s, '');
  let longName = null;
  let paxPath = null;
  let at = 0;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;

    const checksumField = str(at + 148, at + 156).trim();
    if (!/^[0-7]+$/.test(checksumField)) throw new Error('That skill archive has a damaged header.');
    const expectedChecksum = Number.parseInt(checksumField, 8);
    let actualChecksum = 0;
    for (let i = 0; i < 512; i++) actualChecksum += i >= 148 && i < 156 ? 32 : header[i];
    if (actualChecksum !== expectedChecksum) throw new Error('That skill archive has a damaged header.');

    const rawSize = str(at + 124, at + 136).trim();
    if (!/^[0-7]+$/.test(rawSize)) throw new Error('That skill archive has an invalid file size.');
    const size = Number.parseInt(rawSize, 8);
    if (!Number.isSafeInteger(size) || size < 0 || size > tar.length - at - 512) throw new Error('That skill archive is incomplete.');
    const body = tar.subarray(at + 512, at + 512 + size);
    const type = str(at + 156, at + 157) || '0';
    const prefix = str(at + 345, at + 500);
    let name = (prefix ? `${prefix}/` : '') + str(at, at + 100);
    at += 512 + Math.ceil(size / 512) * 512;
    if (at > tar.length) throw new Error('That skill archive is incomplete.');
    if (type === 'L') { longName = decoder.decode(body).replace(/\0.*$/s, ''); continue; }
    if (type === 'x') { paxPath = decoder.decode(body).match(/\d+ path=([^\n]+)\n/)?.[1] ?? null; continue; }
    if (longName) { name = longName; longName = null; }
    if (paxPath) { name = paxPath; paxPath = null; }
    if (!['0', '\0', '7'].includes(type) || name.endsWith('/')) continue;
    const safeName = normalizeArchivePath(name);
    if (!safeName) throw new Error('That skill archive contains an unsafe path.');
    out.push({ path: safeName, data: body });
  }
  return out;
}

/** Read a fetch response incrementally when streams are available, enforcing the cap before buffering grows. */
export async function readBoundedResponse(response, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('The download size limit is invalid.');
  const header = response.headers.get('content-length');
  const declared = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('That download is too large.');

  const reader = response.body?.getReader?.();
  if (reader) {
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error('That download is too large.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  // React Native fetch implementations without ReadableStream support must provide a bounded Content-Length.
  if (!Number.isFinite(declared) || declared < 0) throw new Error('This server did not provide a safe download size.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error('That download is too large.');
  return bytes;
}

/** Parse JSON only after enforcing a byte ceiling on the response body. */
export async function readBoundedJson(response, maxBytes) {
  const bytes = await readBoundedResponse(response, maxBytes);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('That server returned invalid JSON.');
  }
}

/** Gzip decompression stops as soon as output exceeds the archive expansion limit. */
export function gunzipBounded(compressed, maxBytes) {
  const chunks = [];
  let size = 0;
  let ended = false;
  const gunzip = new Gunzip((chunk, final) => {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error('That archive is too large once unpacked.');
    chunks.push(chunk);
    ended ||= final;
  });
  gunzip.push(compressed, true);
  if (!ended) throw new Error('That gzip archive is incomplete.');
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Route tar, gzip-tar, and zip skill packages through bounded parsers. */
export function unpackSafe(bytes, maxUnpacked = 80_000_000) {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return untarSafe(gunzipBounded(bytes, maxUnpacked));
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return untarSafe(bytes);

  let total = 0;
  let invalid = false;
  let tooLarge = false;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      if (entry.name.endsWith('/')) return false;
      if (!normalizeArchivePath(entry.name) || !Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) {
        invalid = true;
        return false;
      }
      total += entry.originalSize;
      if (entry.originalSize > 5_000_000 || total > maxUnpacked) {
        tooLarge = true;
        return false;
      }
      return true;
    },
  });
  if (invalid) throw new Error('That skill archive contains an unsafe path or file size.');
  if (tooLarge) throw new Error('That archive is too large once unpacked.');
  return Object.entries(files).map(([path, data]) => ({ path: normalizeArchivePath(path), data }));
}
