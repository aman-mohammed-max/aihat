import { fetch as streamFetch } from 'expo/fetch';

import { readBytes } from '@/lib/files';
import { getApiKey } from '@/lib/keys';

export type ProviderConn = {
  id: string;
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type ToolDef = { type: 'function'; function: { name: string; description?: string; parameters: object } };

export type Params = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoning?: 'off' | 'low' | 'medium' | 'high';
  stream?: boolean;
};

const base = (u: string) => u.replace(/\/+$/, '');

async function headers(p: ProviderConn) {
  const key = await getApiKey(p.id);
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    ...(p.headers ?? {}),
  };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function withTimeout(ms = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, abort: () => ctl.abort(), done: () => clearTimeout(t) };
}

async function check(res: Response) {
  if (res.ok) return;
  let body = '';
  try {
    body = await res.text();
  } catch {}
  throw new ApiError(res.status, body.slice(0, 300) || res.statusText);
}

/** GET {base}/models. Also measures latency, used for the provider status dot. `raw` keeps any metadata the server sends. */
export async function listModels(p: ProviderConn) {
  const t = withTimeout(p.timeoutMs ?? 15000);
  const started = Date.now();
  try {
    const res = await fetch(`${base(p.baseUrl)}/models`, { headers: await headers(p), signal: t.signal });
    await check(res);
    const data = await res.json();
    const list: any[] = Array.isArray(data) ? data : data.data ?? data.models ?? [];
    const raw = list.map((m) => (typeof m === 'string' ? { id: m } : { ...m, id: m.id ?? m.name })).filter((m) => m.id);
    return { ids: raw.map((m) => String(m.id)), raw: raw as Record<string, any>[], latencyMs: Date.now() - started };
  } finally {
    t.done();
  }
}

/** Voices for GET {base}/audio/voices when the server has it; otherwise null. */
export async function listVoices(p: ProviderConn): Promise<string[] | null> {
  try {
    const res = await fetch(`${base(p.baseUrl)}/audio/voices`, { headers: await headers(p) });
    if (!res.ok) return null;
    const data = await res.json();
    const list: any[] = Array.isArray(data) ? data : data.voices ?? data.data ?? [];
    const names = list.map((v) => (typeof v === 'string' ? v : v.id ?? v.voice_id ?? v.name)).filter(Boolean).map(String);
    return names.length ? names : null;
  } catch {
    return null;
  }
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'done'; tokens?: number; ms: number };

/** POST {base}/chat/completions with SSE streaming. Yields text deltas and assembled tool calls. */
export async function* streamChat(
  p: ProviderConn,
  req: { model: string; messages: ChatMessage[]; tools?: ToolDef[]; params?: Params; signal?: AbortSignal },
): AsyncGenerator<StreamEvent> {
  const started = Date.now();
  const t = withTimeout(p.timeoutMs ?? 60000);
  req.signal?.addEventListener('abort', t.abort);
  const { params = {} } = req;
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: params.stream !== false,
    stream_options: { include_usage: true },
    ...(params.temperature != null && { temperature: params.temperature }),
    ...(params.maxTokens != null && { max_tokens: params.maxTokens }),
    ...(params.topP != null && { top_p: params.topP }),
    ...(params.reasoning && params.reasoning !== 'off' && { reasoning_effort: params.reasoning }),
    ...(req.tools?.length && { tools: req.tools }),
  };

  try {
    const res = await streamFetch(`${base(p.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: await headers(p),
      body: JSON.stringify(body),
      signal: t.signal,
    });
    await check(res as unknown as Response);

    if (!body.stream) {
      const data = await (res as unknown as Response).json();
      const msg = data.choices?.[0]?.message ?? {};
      const why = msg.reasoning_content ?? msg.reasoning;
      if (typeof why === 'string' && why.trim()) yield { type: 'delta', text: `<think>${why}</think>` };
      if (msg.content) yield { type: 'delta', text: msg.content };
      if (msg.tool_calls?.length) yield { type: 'tool_calls', calls: msg.tool_calls };
      yield { type: 'done', tokens: data.usage?.completion_tokens, ms: Date.now() - started };
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let tokens: number | undefined;
    const calls: Record<number, ToolCall> = {};
    // Reasoning that comes in its own field (DeepSeek's reasoning_content, OpenRouter's reasoning) is passed on
    // wrapped in <think>…</think>, like models that write it inline, so the chat shows it the same way.
    let thinking = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk.usage?.completion_tokens) tokens = chunk.usage.completion_tokens;
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        const why = delta.reasoning_content ?? delta.reasoning;
        if (typeof why === 'string' && why) {
          yield { type: 'delta', text: thinking ? why : `<think>${why}` };
          thinking = true;
        }
        if ((delta.content || delta.tool_calls) && thinking) {
          yield { type: 'delta', text: '</think>' };
          thinking = false;
        }
        if (delta.content) yield { type: 'delta', text: delta.content };
        for (const tc of delta.tool_calls ?? []) {
          const c = (calls[tc.index ?? 0] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.function.name += tc.function.name;
          if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
        }
      }
    }
    if (thinking) yield { type: 'delta', text: '</think>' };
    const assembled = Object.values(calls);
    if (assembled.length) yield { type: 'tool_calls', calls: assembled };
    yield { type: 'done', tokens, ms: Date.now() - started };
  } finally {
    t.done();
  }
}

/**
 * Build a multipart/form-data body by hand. React Native's `{ uri, name, type }` file parts are not supported by
 * Expo's fetch ("unsupported form data part"), so the file is read into bytes and encoded here instead.
 */
export function multipartBody(fields: Record<string, string>, file: { field: string; name: string; type: string; bytes: Uint8Array }) {
  const boundary = `----aihat${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const text = (s: string) => chunks.push(enc.encode(s));
  for (const [k, v] of Object.entries(fields)) text(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  text(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`);
  chunks.push(file.bytes);
  text(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/** POST {base}/audio/transcriptions (Whisper-compatible), or /translations for English output. */
export async function transcribe(p: ProviderConn, model: string, fileUri: string, translate = false) {
  const bytes = await readBytes(fileUri);
  if (!bytes.length) throw new Error('The recording was empty. Hold the mic a little longer and try again.');
  // Phones record m4a; the desktop app's web view records webm (Windows, Linux) or mp4 (macOS). Servers go by the name.
  const ext = audioExtension(bytes);
  const type = ext === 'm4a' ? 'audio/m4a' : ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`;
  const { body, contentType } = multipartBody({ model: model || 'whisper-1' }, { field: 'file', name: `audio.${ext}`, type, bytes });
  const h = await headers(p);
  const res = await fetch(`${base(p.baseUrl)}/audio/${translate ? 'translations' : 'transcriptions'}`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': contentType },
    body,
  });
  await check(res);
  return ((await res.json()).text ?? '') as string;
}

/** File extension for audio bytes, from the file header (servers don't always return what was asked for). */
export function audioExtension(b: Uint8Array, contentType = ''): string {
  const head = String.fromCharCode(...b.subarray(0, 4));
  if (head === 'RIFF') return 'wav';
  if (head === 'OggS') return 'ogg';
  if (head === 'fLaC') return 'flac';
  if (head.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (String.fromCharCode(...b.subarray(4, 8)) === 'ftyp') return 'm4a';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  const t = contentType.toLowerCase();
  if (t.includes('wav')) return 'wav';
  if (t.includes('ogg') || t.includes('opus')) return 'ogg';
  if (t.includes('aac') || t.includes('mp4')) return 'm4a';
  if (t.includes('webm')) return 'webm';
  return 'mp3';
}

/**
 * POST {base}/audio/speech. Model, voice and format are only sent when set: gateways route on the model and reject
 * voice names they don't know (an OpenAI voice like "alloy" is not valid for Gemini or Cloudflare models).
 */
export async function synthesize(p: ProviderConn, req: { model?: string; input: string; voice?: string; format?: string }) {
  const res = await fetch(`${base(p.baseUrl)}/audio/speech`, {
    method: 'POST',
    headers: await headers(p),
    body: JSON.stringify({
      ...(req.model ? { model: req.model } : {}),
      input: req.input,
      ...(req.voice ? { voice: req.voice } : {}),
      ...(req.format ? { response_format: req.format } : {}),
    }),
  });
  await check(res);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 100) {
    // A tiny reply is usually a JSON error that came back with a 200.
    const msg = new TextDecoder().decode(bytes);
    if (msg.trim().startsWith('{')) throw new ApiError(502, msg.slice(0, 200));
  }
  return { bytes, ext: audioExtension(bytes, res.headers.get('content-type') ?? '') };
}

/** POST {base}/images/generations. Returns image URLs or data URIs. */
export async function generateImage(p: ProviderConn, req: { model?: string; prompt: string; n?: number; size?: string }) {
  const res = await fetch(`${base(p.baseUrl)}/images/generations`, {
    method: 'POST',
    headers: await headers(p),
    body: JSON.stringify({ n: 1, ...req }),
  });
  await check(res);
  const data = await res.json();
  return (data.data ?? []).map((d: { url?: string; b64_json?: string }) => d.url ?? `data:image/png;base64,${d.b64_json}`) as string[];
}

export type SearchHit = { title: string; url: string; snippet: string };

/**
 * POST {base}/search. Providers like FreeLLMAPI don't publish a schema for this route, so the
 * request carries the common field names and the reply is read in several common shapes.
 */
export async function providerSearch(p: ProviderConn, query: string, n: number, model?: string): Promise<SearchHit[]> {
  const res = await fetch(`${base(p.baseUrl)}/search`, {
    method: 'POST',
    headers: await headers(p),
    body: JSON.stringify({ query, q: query, max_results: n, num_results: n, n, count: n, ...(model ? { model } : {}) }),
  });
  await check(res);
  const data = await res.json();
  const list: any[] = data.results ?? data.data ?? data.items ?? data.web?.results ?? data.organic ?? (Array.isArray(data) ? data : []);
  return list.slice(0, n).map((r) => ({
    title: String(r.title ?? r.name ?? r.url ?? ''),
    url: String(r.url ?? r.link ?? r.href ?? ''),
    snippet: String(r.snippet ?? r.content ?? r.description ?? r.text ?? r.summary ?? ''),
  })).filter((h) => h.url);
}

/** POST {base}/embeddings. */
export async function embed(p: ProviderConn, model: string, input: string[]) {
  const res = await fetch(`${base(p.baseUrl)}/embeddings`, { method: 'POST', headers: await headers(p), body: JSON.stringify({ model, input }) });
  await check(res);
  return ((await res.json()).data as { embedding: number[] }[]).map((d) => d.embedding);
}
