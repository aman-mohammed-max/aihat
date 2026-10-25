// Desktop app: picked files and recordings are blob: addresses in the page; saved files go to Downloads through the
// app's Bun backend.

export const readBytes = async (uri: string) => new Uint8Array(await (await fetch(uri)).arrayBuffer());

export const readText = async (uri: string) => (await fetch(uri)).text();

export async function saveFile(name: string, data: string | Uint8Array, _mimeType?: string): Promise<string | null> {
  const res = await fetch(`/api/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: typeof data === 'string' ? data : new Blob([data as Uint8Array<ArrayBuffer>]) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? 'The file could not be saved.');
  return out.path as string;
}

export async function keepBackup(json: string) {
  const res = await fetch('/api/backup', { method: 'POST', body: json });
  if (!res.ok) throw new Error('The backup could not be written.');
}
