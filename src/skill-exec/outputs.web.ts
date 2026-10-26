import { bytesToB64, b64ToBytes } from './b64';

const TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
};

/** Desktop: keep the file inside the chat as a data: address (it survives restarts and backups). */
export function keepOutput(name: string, bytes: Uint8Array) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return `data:${TYPES[ext] ?? 'application/octet-stream'};base64,${bytesToB64(bytes)}`;
}

/** Desktop: save it to Downloads and show it in the file manager. */
export async function openOutput(uri: string, name: string) {
  const bytes = uri.startsWith('data:') ? b64ToBytes(uri.slice(uri.indexOf(',') + 1)) : new Uint8Array(await (await fetch(uri)).arrayBuffer());
  const res = await fetch(`/api/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: new Blob([bytes as Uint8Array<ArrayBuffer>]) });
  if (!res.ok) throw new Error('The file could not be saved.');
}
