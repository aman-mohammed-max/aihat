import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** The bytes of a picked file, a recording or a cached download. */
export const readBytes = async (uri: string) => new Uint8Array(await new File(uri).arrayBuffer());

export const readText = (uri: string) => new File(uri).text();

/**
 * Hand a file to the user: the share sheet on a phone (save to Files, Drive, send it), Downloads on a computer.
 * Resolves with the path when the file landed somewhere known.
 */
export async function saveFile(name: string, data: string | Uint8Array, mimeType?: string): Promise<string | null> {
  const f = new File(Paths.cache, name);
  f.write(data);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: `Save ${name}` });
  return null;
}

/** Keep a scheduled backup on this device; the newest five stay. */
export async function keepBackup(json: string) {
  const dir = new Directory(Paths.document, 'backups');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  new File(dir, `auto-${Date.now()}.json`).write(json);
  const files = dir.list().filter((f): f is File => f instanceof File).sort((a, b) => a.name.localeCompare(b.name));
  files.slice(0, Math.max(files.length - 5, 0)).forEach((f) => f.delete());
}
