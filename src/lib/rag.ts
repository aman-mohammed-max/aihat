import { embed } from '@/api/openai';
import { getDb } from '@/db';
import { useSettings } from '@/store/settings';

import { requireRoute } from './endpoints';
import { uid } from './id';

/** Split text into overlapping passages, preferring paragraph / sentence boundaries. */
export function chunkText(text: string, tokens: number) {
  const size = Math.max(tokens, 100) * 4; // ~4 characters per token
  const overlap = Math.floor(size * 0.1);
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const cut = Math.max(text.lastIndexOf('\n\n', end), text.lastIndexOf('. ', end));
      if (cut > i + size * 0.5) end = cut + 1;
    }
    const piece = text.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= text.length) break;
    i = end - overlap;
  }
  return out;
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

/** A file is worth indexing when whole-file sending would be wasteful (more than ~3 passages). */
export const shouldIndex = (text: string) => {
  const s = useSettings.getState();
  return s.fileMode === 'rag' && text.length > s.chunkSize * 4 * 3;
};

/** Chunk a file, embed the passages with the embeddings endpoint, and store them for this chat. */
export async function indexFile(chatId: string, fileName: string, text: string) {
  const { provider, model } = requireRoute('embeddings');
  if (!model) throw new Error('Pick an embedding model in Files & documents.');
  const chunks = chunkText(text, useSettings.getState().chunkSize);
  const db = await getDb();
  for (let i = 0; i < chunks.length; i += 32) {
    const batch = chunks.slice(i, i + 32);
    const vecs = await embed(provider, model, batch);
    for (let j = 0; j < batch.length; j++) {
      await db.runAsync('INSERT INTO rag_chunks (id,chat_id,file_name,idx,text,vec) VALUES (?,?,?,?,?,?)', uid(), chatId, fileName, i + j, batch[j], JSON.stringify(vecs[j]));
    }
  }
  return chunks.length;
}

/** Best passages from this chat's indexed files for a question. */
export async function retrieve(chatId: string, question: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ file_name: string; text: string; vec: string }>('SELECT file_name,text,vec FROM rag_chunks WHERE chat_id=?', chatId);
  if (!rows.length) return [];
  const { provider, model } = requireRoute('embeddings');
  const [q] = await embed(provider, model, [question]);
  return rows
    .map((r) => ({ file: r.file_name, text: r.text, score: cosine(q, JSON.parse(r.vec)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, useSettings.getState().topK);
}

export async function clearIndex(chatId?: string) {
  const db = await getDb();
  if (chatId) await db.runAsync('DELETE FROM rag_chunks WHERE chat_id=?', chatId);
  else await db.runAsync('DELETE FROM rag_chunks');
}

export async function indexSize() {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number; b: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(text)+LENGTH(vec)),0) AS b FROM rag_chunks');
  return { passages: r?.n ?? 0, bytes: r?.b ?? 0 };
}
