import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { uid } from '@/lib/id';

/** Keep a file a script made, under its own name, so it can be opened from the chat later. Returns its address. */
export function keepOutput(name: string, bytes: Uint8Array) {
  const dir = new Directory(Paths.document, 'skill-output', uid());
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, name.split('/').pop() || 'file');
  file.write(bytes);
  return file.uri;
}

/** Open or save a file a script made: the share sheet lists "Open in…", Files, Drive and more. */
export async function openOutput(uri: string, name: string) {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: name });
}
