// Desktop app: pictures are kept in the chat itself as data: addresses (they survive restarts and backups), and
// audio to play once is a blob: address.

export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const toDataUri = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the image.'));
    r.readAsDataURL(blob);
  });

/** Keep an image (data URI or http URL) with the chat, so it still shows when the address stops working. */
export async function saveImage(src: string): Promise<string> {
  if (!/^https?:/.test(src)) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not download the image (${res.status})`);
  return toDataUri(await res.blob());
}

const TYPES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', png: 'image/png' };

export function saveBytes(bytes: Uint8Array, ext: string) {
  return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: TYPES[ext] ?? 'application/octet-stream' }));
}
