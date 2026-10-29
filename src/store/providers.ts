import { create } from 'zustand';

import { listModels, type Params } from '@/api/openai';
import { getDb, json } from '@/db';
import { isLocalProvider } from '@/lib/local/provider';
import { classifyModel, type ModelKind } from '@/lib/models';
import { uid } from '@/lib/id';
import { deleteApiKey, setApiKey } from '@/lib/keys';

export type Caps = { kind?: ModelKind; /** Added by the user rather than fetched; survives refreshes. */ custom?: boolean; /** The user set the kind by hand; refresh won't overwrite it. */ kindLocked?: boolean; tools?: boolean; vision?: boolean; embeddings?: boolean; contextK?: number; structured?: 'structuredOutput' | 'jsonMode' | 'promptOnly' };
export type Provider = {
  id: string; name: string; baseUrl: string; headers: Record<string, string>; timeoutMs: number;
  isDefault: boolean; status: 'unknown' | 'online' | 'offline' | 'rejected'; latencyMs: number | null;
};
/** Chat-capable: everything except image / speech / transcription / embedding / video models. */
export const isChatModel = (m: { caps: Caps }) => !m.caps.kind || m.caps.kind === 'chat';

export type Model = {
  id: string; providerId: string; name: string; enabled: boolean; caps: Caps;
  /** Settings new chats with this model start with (over the app-wide defaults). */
  defaults: Partial<Params>;
};

export const PRESETS = [
  { name: 'vLLM', baseUrl: 'http://localhost:8000/v1' },
  { name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { name: 'FreeLLMAPI', baseUrl: '' },
  { name: 'Custom', baseUrl: '' },
] as const;

type State = {
  loaded: boolean;
  providers: Provider[];
  models: Model[];
  load: () => Promise<void>;
  add: (p: Omit<Provider, 'id' | 'status' | 'latencyMs' | 'isDefault'>, apiKey?: string) => Promise<string>;
  update: (id: string, patch: Partial<Provider>, apiKey?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  refreshModels: (id: string) => Promise<{ ok: boolean; error?: string; added: number; removed: number; total: number }>;
  /** Re-fetch every provider's model list. */
  refreshAll: () => Promise<{ ok: number; failed: string[]; added: number; total: number }>;
  addModel: (providerId: string, m: { id: string; name?: string; kind: ModelKind }) => Promise<{ ok: boolean; error?: string }>;
  updateModel: (providerId: string, id: string, patch: { name?: string; kind?: ModelKind; enabled?: boolean; tools?: boolean }) => Promise<void>;
  deleteModel: (providerId: string, id: string) => Promise<void>;
  toggleModel: (providerId: string, modelId: string, enabled: boolean) => Promise<void>;
  setModelDefaults: (providerId: string, modelId: string, defaults: Partial<Params>) => Promise<void>;
};

const row = (r: any): Provider => ({
  id: r.id, name: r.name, baseUrl: r.base_url, headers: json(r.headers, {}), timeoutMs: r.timeout_ms,
  isDefault: !!r.is_default, status: r.status, latencyMs: r.latency_ms,
});

export const useProviders = create<State>((set, get) => ({
  loaded: false,
  providers: [],
  models: [],

  async load() {
    const db = await getDb();
    const providers = (await db.getAllAsync('SELECT * FROM providers ORDER BY name')).map(row);
    const models = (await db.getAllAsync<any>('SELECT * FROM models ORDER BY name')).map((m): Model => ({
      id: m.id, providerId: m.provider_id, name: m.name, enabled: !!m.enabled, caps: json(m.caps, {}), defaults: json(m.defaults, {}),
    }));
    set({ providers, models, loaded: true });
  },

  async add(p, apiKey) {
    const db = await getDb();
    const id = uid();
    const isDefault = get().providers.length === 0;
    await db.runAsync(
      'INSERT INTO providers (id,name,base_url,headers,timeout_ms,is_default) VALUES (?,?,?,?,?,?)',
      id, p.name, p.baseUrl, JSON.stringify(p.headers), p.timeoutMs, isDefault ? 1 : 0,
    );
    if (apiKey) await setApiKey(id, apiKey);
    await get().load();
    return id;
  },

  async update(id, patch, apiKey) {
    const db = await getDb();
    const cur = get().providers.find((p) => p.id === id);
    if (!cur) return;
    const n = { ...cur, ...patch };
    await db.runAsync(
      'UPDATE providers SET name=?, base_url=?, headers=?, timeout_ms=?, status=?, latency_ms=? WHERE id=?',
      n.name, n.baseUrl, JSON.stringify(n.headers), n.timeoutMs, n.status, n.latencyMs, id,
    );
    if (apiKey !== undefined) await setApiKey(id, apiKey);
    await get().load();
  },

  async remove(id) {
    const db = await getDb();
    await db.runAsync('DELETE FROM models WHERE provider_id=?', id);
    await db.runAsync('DELETE FROM providers WHERE id=?', id);
    await deleteApiKey(id);
    await get().load();
  },

  async setDefault(id) {
    const db = await getDb();
    await db.runAsync('UPDATE providers SET is_default = (id = ?)', id);
    await get().load();
  },

  async refreshModels(id) {
    const p = get().providers.find((x) => x.id === id);
    const none = { added: 0, removed: 0, total: 0 };
    if (!p) return { ok: false, error: 'Unknown provider', ...none };
    const db = await getDb();
    try {
      const { raw, latencyMs } = await listModels(p);
      const existing = new Map(get().models.filter((m) => m.providerId === id).map((m) => [m.id, m]));
      const seen = new Set<string>();
      let added = 0;
      for (const rec of raw) {
        const mid = String(rec.id);
        seen.add(mid);
        const kind = classifyModel(rec);
        const lower = mid.toLowerCase();
        // Models on the device read text only and don't use tools.
        const guess: Caps = isLocalProvider(p)
          ? { kind: 'chat', tools: false, vision: false }
          : { kind, embeddings: kind === 'embedding', vision: /vl|vision|llava|4o|gemini|claude|pixtral/.test(lower), tools: kind === 'chat' };
        const prev = existing.get(mid);
        if (prev) {
          // A kind the user chose by hand wins over detection; everything else is refreshed.
          const merged = prev.caps.kindLocked ? { ...guess, ...prev.caps } : { ...guess, ...prev.caps, kind };
          await db.runAsync('UPDATE models SET caps=? WHERE id=? AND provider_id=?', JSON.stringify(merged), mid, id);
        } else {
          added++;
          await db.runAsync('INSERT INTO models (id,provider_id,name,enabled,caps) VALUES (?,?,?,?,?)', mid, id, mid, 1, JSON.stringify(guess));
        }
      }
      // Models the server no longer lists are dropped, but anything the user added stays.
      let removed = 0;
      for (const m of existing.values()) {
        // An empty reply is more likely a server hiccup than "every model was removed": keep what we have.
        if (raw.length && !seen.has(m.id) && !m.caps.custom) {
          removed++;
          await db.runAsync('DELETE FROM models WHERE id=? AND provider_id=?', m.id, id);
        }
      }
      await db.runAsync('UPDATE providers SET status=?, latency_ms=? WHERE id=?', 'online', latencyMs, id);
      await get().load();
      return { ok: true, added, removed, total: get().models.filter((m) => m.providerId === id).length };
    } catch (e: any) {
      const status = e?.status === 401 || e?.status === 403 ? 'rejected' : 'offline';
      await db.runAsync('UPDATE providers SET status=?, latency_ms=NULL WHERE id=?', status, id);
      await get().load();
      return { ok: false, error: status === 'rejected' ? 'Key rejected (401)' : e?.message ?? 'Unreachable', ...none };
    }
  },

  async refreshAll() {
    const results = await Promise.all(get().providers.map(async (p) => ({ p, r: await get().refreshModels(p.id) })));
    return {
      ok: results.filter((x) => x.r.ok).length,
      failed: results.filter((x) => !x.r.ok).map((x) => x.p.name),
      added: results.reduce((n, x) => n + x.r.added, 0),
      total: get().models.length,
    };
  },

  async addModel(providerId, m) {
    const id = m.id.trim();
    if (!id) return { ok: false, error: 'Enter the model id exactly as the provider names it.' };
    if (get().models.some((x) => x.providerId === providerId && x.id === id)) return { ok: false, error: 'That model is already in the list.' };
    const caps: Caps = { kind: m.kind, custom: true, kindLocked: true, embeddings: m.kind === 'embedding', tools: m.kind === 'chat' };
    await (await getDb()).runAsync('INSERT INTO models (id,provider_id,name,enabled,caps) VALUES (?,?,?,?,?)', id, providerId, m.name?.trim() || id, 1, JSON.stringify(caps));
    await get().load();
    return { ok: true };
  },

  async updateModel(providerId, id, patch) {
    const cur = get().models.find((m) => m.providerId === providerId && m.id === id);
    if (!cur) return;
    const changedKind = patch.kind && patch.kind !== cur.caps.kind;
    const caps: Caps = {
      ...cur.caps,
      ...(changedKind ? { kind: patch.kind, kindLocked: true, embeddings: patch.kind === 'embedding', tools: patch.kind === 'chat' } : {}),
      ...(patch.tools !== undefined ? { tools: patch.tools } : {}),
    };
    await (await getDb()).runAsync('UPDATE models SET name=?, enabled=?, caps=? WHERE id=? AND provider_id=?', patch.name?.trim() || cur.name, (patch.enabled ?? cur.enabled) ? 1 : 0, JSON.stringify(caps), id, providerId);
    await get().load();
  },

  async deleteModel(providerId, id) {
    await (await getDb()).runAsync('DELETE FROM models WHERE id=? AND provider_id=?', id, providerId);
    await get().load();
  },

  async toggleModel(providerId, modelId, enabled) {
    const db = await getDb();
    await db.runAsync('UPDATE models SET enabled=? WHERE id=? AND provider_id=?', enabled ? 1 : 0, modelId, providerId);
    await get().load();
  },

  async setModelDefaults(providerId, modelId, defaults) {
    await (await getDb()).runAsync('UPDATE models SET defaults=? WHERE id=? AND provider_id=?', JSON.stringify(defaults), modelId, providerId);
    set({ models: get().models.map((m) => (m.providerId === providerId && m.id === modelId ? { ...m, defaults } : m)) });
  },
}));
