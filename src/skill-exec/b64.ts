const enc = new TextEncoder();

export function bytesToB64(u: Uint8Array) {
  let s = '';
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
  return btoa(s);
}

export function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** Text or bytes → base64, for every file of a job. */
export function filesToB64(map: Record<string, Uint8Array | string> | undefined) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map ?? {})) out[k] = bytesToB64(typeof v === 'string' ? enc.encode(v) : v);
  return out;
}

export function filesFromB64(map: Record<string, string> | undefined) {
  const out: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(map ?? {})) out[k] = b64ToBytes(v);
  return out;
}
