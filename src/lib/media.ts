import { Directory, File, Paths } from 'expo-file-system';

import { uid } from './id';

const dir = () => {
  const d = new Directory(Paths.document, 'media');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};

export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Persist an image (data URI or http URL) into the app's documents folder so chats keep working offline. */
export async function saveImage(src: string): Promise<string> {
  const file = new File(dir(), `${uid()}.png`);
  if (src.startsWith('data:')) file.write(b64ToBytes(src.split(',')[1]));
  else if (/^https?:/.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Could not download the image (${res.status})`);
    file.write(new Uint8Array(await res.arrayBuffer()));
  } else return src;
  return file.uri;
}

export function saveBytes(bytes: Uint8Array, ext: string) {
  const file = new File(dir(), `${uid()}.${ext}`);
  file.write(bytes);
  return file.uri;
}
