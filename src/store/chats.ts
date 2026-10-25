import { Alert } from 'react-native';
import { create } from 'zustand';

import { callTool } from '@/api/mcp';
import { streamChat, type ChatMessage, type Params, type ToolCall, type ToolDef } from '@/api/openai';
import { formatHits, webSearch } from '@/lib/search';
import { mergeLoaded } from '@/lib/merge';
import { clearIndex, indexFile, retrieve, shouldIndex } from '@/lib/rag';
import { generateImages, type ImageOverrides } from '@/lib/imagegen';
import { quickComplete } from '@/lib/llm';
import { speak } from '@/lib/tts';
import * as haptic from '@/lib/haptics';
import { ensureNotifyPermission, notifyReply, previewOf } from '@/lib/notify';
import { cleanTitle, initialTitle, isTrivial, shouldRetitle, titleMessages } from '@/lib/titles';
import { getDb, json } from '@/db';
import { now, uid } from '@/lib/id';

import { fileNote, normPath, skillMenu } from '@/lib/skills';
import { genUiSystemPrompt } from '@/genui/catalog';
import { wantsUI } from '@/genui/parse';

import { useLibrary, type McpServer } from './library';
import { useProviders, isChatModel } from './providers';
import { useSettings } from './settings';

export type Attachment = { id: string; kind: 'image' | 'file'; name: string; uri: string; mime?: string; text?: string; indexed?: boolean; inline?: boolean;
  /** Short description shown on the chip, e.g. "12 pages · 34k chars". */
  meta?: string };
export type ToolRun = { id: string; name: string; server?: string; skill?: string; args: string; result?: string; error?: string; status: 'pending' | 'running' | 'done' | 'error' | 'rejected' };
export type Message = {
  id: string; chatId: string; role: 'user' | 'assistant' | 'system'; content: string;
  attachments: Attachment[]; toolCalls: ToolRun[]; citations: { title: string; url: string }[];
  uiSpec?: object | null; tokens?: number | null; ms?: number | null; createdAt: number; error?: string;
  /** Transient progress line shown while a reply is being prepared (not saved), e.g. "Improving your prompt…". */
  status?: string;
  /** A second line under the status: the query, the improved prompt, the tool's arguments… */
  statusDetail?: string;
  /** When the current status began, for the running timer. */
  statusSince?: number;
};
export type Chat = {
  id: string; title: string; pinned: boolean; providerId: string | null; modelId: string | null; promptId: string | null;
  params: Params; toolIds: string[]; searchMode: boolean; createdAt: number; updatedAt: number;
  archived: boolean; temporary: boolean;
  /** True once the user renamed the chat; automatic naming then leaves it alone. */
  titleLocked: boolean;
};

type State = {
  chats: Chat[];
  messages: Record<string, Message[]>;
  streaming: Record<string, boolean>;
  /** Write/delete tool awaiting the user's approval (Generative-UI "Allow this action?" sheet). */
  approval: { chatId: string; run: ToolRun; resolve: (ok: boolean) => void } | null;
  load: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  create: (init?: Partial<Chat>) => Promise<string>;
  patch: (id: string, patch: Partial<Chat>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  send: (chatId: string, text: string, attachments?: Attachment[], opts?: { citations?: { title: string; url: string }[]; ui?: boolean; search?: boolean; skills?: string[] }) => Promise<void>;
  /** Delete temporary chats and archive chats older than the "archive after" setting. Run once at startup. */
  housekeeping: () => Promise<void>;
  sendImage: (chatId: string, prompt: string, opts?: ImageSendOptions) => Promise<void>;
  clear: (chatId: string) => Promise<void>;
  branch: (chatId: string, uptoMessageId: string) => Promise<string>;
  /** Add an assistant message to a chat without calling the model (used to start a chat from a summary). */
  addAssistantMessage: (chatId: string, content: string) => Promise<void>;
  stop: (chatId: string) => void;
  regenerate: (chatId: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
};

const aborts = new Map<string, AbortController>();

export type ImageSendOptions = { refine?: boolean; model?: string; aspect?: ImageOverrides['aspect']; n?: number };

const IMAGE_PROMPT_SYSTEM =
  'You write prompts for text-to-image models. Turn the user’s idea into one vivid prompt: subject, setting, style, lighting, ' +
  'composition and mood, in plain comma-separated phrases, under 80 words. Keep every detail the user asked for. ' +
  'Reply with the prompt only: no quotes, no preamble.';

const chatRow = (r: any): Chat => ({
  id: r.id, title: r.title, pinned: !!r.pinned, providerId: r.provider_id, modelId: r.model_id, promptId: r.prompt_id,
  params: json(r.params, {}), toolIds: json(r.tool_ids, []), searchMode: !!r.search_mode, createdAt: r.created_at, updatedAt: r.updated_at,
  archived: !!r.archived, temporary: !!r.temporary, titleLocked: !!r.title_locked,
});
const msgRow = (r: any): Message => ({
  id: r.id, chatId: r.chat_id, role: r.role, content: r.content, attachments: json(r.attachments, []),
  toolCalls: json(r.tool_calls, []), citations: json(r.citations, []), uiSpec: json(r.ui_spec, null),
  tokens: r.tokens, ms: r.ms, createdAt: r.created_at,
});

async function saveMessage(m: Message) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO messages (id,chat_id,role,content,attachments,tool_calls,citations,ui_spec,tokens,ms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    m.id, m.chatId, m.role, m.content, JSON.stringify(m.attachments), JSON.stringify(m.toolCalls),
    JSON.stringify(m.citations), m.uiSpec ? JSON.stringify(m.uiSpec) : null, m.tokens ?? null, m.ms ?? null, m.createdAt,
  );
}

/** Send the (large) UI instructions only when they'll be used: the UI chip, a message asking for one, or "Always". */
const genUiOn = (modelId: string, text: string, forced?: boolean) => {
  const st = useSettings.getState();
  if (!st.genUi || st.genUiDisabledModels.includes(modelId)) return false;
  return !!forced || st.genUiMode === 'always' || (st.genUiMode === 'auto' && wantsUI(text));
};

const WEB_SEARCH = 'web_search';
const USE_SKILL = 'use_skill';
const READ_SKILL_FILE = 'read_skill_file';
/** A skill loaded into the conversation is capped so one huge SKILL.md can't fill the model's context. */
const MAX_SKILL_CHARS = 60_000;
const MAX_INLINE_CHARS = 100_000;

const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

function applyVariables(body: string, vars: { key: string; value: string }[], model: string) {
  let out = body
    .replaceAll('{date}', new Date().toLocaleDateString())
    .replaceAll('{language}', 'English')
    .replaceAll('{model}', model);
  for (const v of vars) out = out.replaceAll(`{${v.key}}`, v.value);
  return out;
}

/**
 * Ask a small model to name the chat from what has actually been discussed. Returns the new title, or null if
 * nothing usable came back. Used for automatic naming and for the Rename dialog's "Suggest a name".
 */
export async function generateTitle(chatId: string): Promise<string | null> {
  const st = useSettings.getState();
  const chat = useChats.getState().chats.find((c) => c.id === chatId);
  if (!chat) return null;
  const { providers, models } = useProviders.getState();
  const modelId = st.titleModelId ?? chat.modelId;
  const provider = providers.find((p) => p.id === models.find((m) => m.id === modelId)?.providerId) ?? providers.find((p) => p.id === chat.providerId);
  if (!provider || !modelId) return null;
  try {
    let out = '';
    for await (const ev of streamChat(provider, {
      model: modelId,
      params: { stream: true, maxTokens: 24, temperature: 0.2 },
      messages: titleMessages(chat.title, useChats.getState().messages[chatId] ?? []),
    })) {
      if (ev.type === 'delta') out += ev.text;
    }
    return cleanTitle(out) || null;
  } catch {
    return null;
  }
}

/** After a reply: re-check an automatic title (never one the user set). */
async function maybeRetitle(chatId: string) {
  const chat = useChats.getState().chats.find((c) => c.id === chatId);
  if (!chat || chat.titleLocked || !useSettings.getState().autoTitle) return;
  const msgs = useChats.getState().messages[chatId] ?? [];
  const replies = msgs.filter((m) => m.role === 'assistant' && m.content && !m.error).length;
  const hasTopic = msgs.some((m) => m.role === 'user' && !isTrivial(m.content));
  if (!shouldRetitle(replies, hasTopic)) return;
  const title = await generateTitle(chatId);
  const now = useChats.getState().chats.find((c) => c.id === chatId);
  if (title && now && !now.titleLocked && title !== now.title) await useChats.getState().patch(chatId, { title });
}

export const useChats = create<State>((set, get) => ({
  chats: [], messages: {}, streaming: {}, approval: null,

  async load() {
    const db = await getDb();
    set({ chats: (await db.getAllAsync('SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC')).map(chatRow) });
  },

  async loadMessages(chatId) {
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT * FROM messages WHERE chat_id=? ORDER BY created_at', chatId);
    set((s) => ({ messages: { ...s.messages, [chatId]: mergeLoaded(rows.map(msgRow), s.messages[chatId] ?? []) } }));
  },

  async create(init = {}) {
    const db = await getDb();
    const p = useProviders.getState();
    const def = p.providers.find((x) => x.isDefault) ?? p.providers[0];
    const model = p.models.find((m) => m.providerId === def?.id && m.enabled && isChatModel(m));
    const servers = useLibrary.getState().servers.filter((s) => s.enabledByDefault).map((s) => s.id);
    const chat: Chat = {
      id: uid(), title: 'New chat', pinned: false, providerId: def?.id ?? null, modelId: model?.id ?? null, promptId: null,
      params: {}, toolIds: servers, searchMode: false, createdAt: now(), updatedAt: now(),
      archived: false, temporary: useSettings.getState().tempByDefault, titleLocked: false, ...init,
    };
    await db.runAsync(
      'INSERT INTO chats (id,title,pinned,provider_id,model_id,prompt_id,params,tool_ids,search_mode,created_at,updated_at,archived,temporary,title_locked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      chat.id, chat.title, 0, chat.providerId, chat.modelId, chat.promptId, JSON.stringify(chat.params),
      JSON.stringify(chat.toolIds), 0, chat.createdAt, chat.updatedAt, chat.archived ? 1 : 0, chat.temporary ? 1 : 0, chat.titleLocked ? 1 : 0,
    );
    set((s) => ({ chats: [chat, ...s.chats], messages: { ...s.messages, [chat.id]: [] } }));
    return chat.id;
  },

  async patch(id, patch) {
    const cur = get().chats.find((c) => c.id === id);
    if (!cur) return;
    const n = { ...cur, ...patch, updatedAt: now() };
    await (await getDb()).runAsync(
      'UPDATE chats SET title=?,pinned=?,provider_id=?,model_id=?,prompt_id=?,params=?,tool_ids=?,search_mode=?,updated_at=?,archived=?,temporary=?,title_locked=? WHERE id=?',
      n.title, n.pinned ? 1 : 0, n.providerId, n.modelId, n.promptId, JSON.stringify(n.params), JSON.stringify(n.toolIds),
      n.searchMode ? 1 : 0, n.updatedAt, n.archived ? 1 : 0, n.temporary ? 1 : 0, n.titleLocked ? 1 : 0, id,
    );
    set((s) => ({ chats: s.chats.map((c) => (c.id === id ? n : c)).sort((a, b) => +b.pinned - +a.pinned || b.updatedAt - a.updatedAt) }));
  },

  async remove(id) {
    const db = await getDb();
    await db.runAsync('DELETE FROM messages WHERE chat_id=?', id);
    await db.runAsync('DELETE FROM chats WHERE id=?', id);
    await clearIndex(id);
    set((s) => ({ chats: s.chats.filter((c) => c.id !== id) }));
  },

  async housekeeping() {
    const db = await getDb();
    const temps = await db.getAllAsync<{ id: string }>('SELECT id FROM chats WHERE temporary=1');
    for (const t of temps) await get().remove(t.id);
    const days = useSettings.getState().archiveDays;
    if (days > 0) await db.runAsync('UPDATE chats SET archived=1 WHERE pinned=0 AND archived=0 AND updated_at < ?', now() - days * 86_400_000);
    await get().load();
  },

  /** Copy a chat up to and including a message into a new chat. */
  async branch(chatId, uptoMessageId) {
    const src = get().chats.find((c) => c.id === chatId)!;
    const list = get().messages[chatId] ?? [];
    const cut = list.findIndex((m) => m.id === uptoMessageId);
    const id = await get().create({ title: `${src.title} (branch)`, providerId: src.providerId, modelId: src.modelId, promptId: src.promptId, params: src.params, toolIds: src.toolIds });
    const copies = list.slice(0, cut + 1).map((m, i): Message => ({ ...m, id: uid(), chatId: id, createdAt: now() + i }));
    for (const m of copies) await saveMessage(m);
    set((s) => ({ messages: { ...s.messages, [id]: copies } }));
    return id;
  },

  async addAssistantMessage(chatId, content) {
    const m: Message = { id: uid(), chatId, role: 'assistant', content, attachments: [], toolCalls: [], citations: [], createdAt: now() };
    await saveMessage(m);
    set((s) => ({ messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), m] } }));
  },

  stop(chatId) {
    if (aborts.has(chatId)) haptic.warning();
    aborts.get(chatId)?.abort();
  },

  /**
   * Image turn. With `refine`, the chat model first rewrites the idea into a detailed image prompt (shown under the
   * result), then the image model generates it. `model` / `aspect` / `n` override the Images settings for this one.
   */
  async sendImage(chatId, idea, opts = {}) {
    const chat = get().chats.find((c) => c.id === chatId);
    const setMsgs = (fn: (l: Message[]) => Message[]) => set((s) => ({ messages: { ...s.messages, [chatId]: fn(s.messages[chatId] ?? []) } }));
    const userMsg: Message = { id: uid(), chatId, role: 'user', content: idea, attachments: [], toolCalls: [], citations: [], createdAt: now() };
    const reply: Message = { id: uid(), chatId, role: 'assistant', content: '', attachments: [], toolCalls: [], citations: [], createdAt: now() + 1 };
    setMsgs((l) => [...l, userMsg, reply]);
    await saveMessage(userMsg);
    if (get().messages[chatId].length === 2) await get().patch(chatId, { title: initialTitle(idea) });
    const ctl = new AbortController();
    aborts.set(chatId, ctl);
    set((s) => ({ streaming: { ...s.streaming, [chatId]: true } }));
    void ensureNotifyPermission();
    const show = (status?: string, detail?: string) => {
      Object.assign(reply, { status, statusDetail: detail, statusSince: status ? now() : undefined });
      setMsgs((l) => l.map((m) => (m.id === reply.id ? { ...reply } : m)));
    };
    const started = now();
    try {
      let prompt = idea;
      if (opts.refine) {
        show('Improving your prompt…', `“${idea.slice(0, 120)}”`);
        try {
          const improved = (await quickComplete({ chat, system: IMAGE_PROMPT_SYSTEM, user: idea, maxTokens: 200, temperature: 0.8 })).replace(/^["'“]+|["'”]+$/g, '').trim();
          if (improved) prompt = improved;
        } catch {
          /* fall back to the idea as typed */
        }
      }
      if (ctl.signal.aborted) throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
      show('Generating image…', prompt.slice(0, 220));
      const uris = await Promise.race([
        generateImages(prompt, { model: opts.model, aspect: opts.aspect, n: opts.n }),
        new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(Object.assign(new Error('Stopped'), { name: 'AbortError' })))),
      ]);
      reply.attachments = uris.map((uri, i) => ({ id: uid(), kind: 'image' as const, name: `image-${i + 1}.png`, uri }));
      if (prompt !== idea) reply.content = `*Prompt used:* ${prompt}`;
      reply.ms = now() - started;
    } catch (e: any) {
      if (e?.name === 'AbortError') reply.content = '*Stopped before the image finished.*';
      else reply.error = e?.message ?? 'Image generation failed.';
    }
    aborts.delete(chatId);
    set((s) => ({ streaming: { ...s.streaming, [chatId]: false } }));
    setMsgs((l) => l.map((m) => (m.id === reply.id ? { ...reply, status: undefined, statusDetail: undefined, statusSince: undefined } : m)));
    await saveMessage(reply);
    if (reply.error) haptic.error();
    else haptic.success();
    await get().patch(chatId, {});
    if (!ctl.signal.aborted) {
      const title = get().chats.find((c) => c.id === chatId)?.title ?? '';
      void notifyReply(chatId, title, reply.error ? 'Couldn’t make the image. Tap to see why.' : reply.attachments.length > 1 ? `${reply.attachments.length} images are ready.` : 'Your image is ready.');
    }
  },

  /** Remove every message from a chat (the chat itself stays). */
  async clear(chatId) {
    const db = await getDb();
    await db.runAsync('DELETE FROM messages WHERE chat_id=?', chatId);
    await clearIndex(chatId);
    set((s) => ({ messages: { ...s.messages, [chatId]: [] } }));
    await get().patch(chatId, { title: 'New chat', titleLocked: false });
  },

  async deleteMessage(chatId, messageId) {
    await (await getDb()).runAsync('DELETE FROM messages WHERE id=?', messageId);
    set((s) => ({ messages: { ...s.messages, [chatId]: (s.messages[chatId] ?? []).filter((m) => m.id !== messageId) } }));
  },

  async regenerate(chatId) {
    const list = get().messages[chatId] ?? [];
    const lastUser = [...list].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const tail = list.slice(list.findIndex((m) => m.id === lastUser.id) + 1);
    for (const m of tail) await get().deleteMessage(chatId, m.id);
    await get().deleteMessage(chatId, lastUser.id);
    await get().send(chatId, lastUser.content, lastUser.attachments);
  },

  async send(chatId, text, attachments = [], opts = {}) {
    const chat = get().chats.find((c) => c.id === chatId);
    if (!chat) return;
    const { providers } = useProviders.getState();
    const provider = providers.find((p) => p.id === chat.providerId);
    const setMsgs = (fn: (l: Message[]) => Message[]) => set((s) => ({ messages: { ...s.messages, [chatId]: fn(s.messages[chatId] ?? []) } }));

    const userMsg: Message = { id: uid(), chatId, role: 'user', content: text, attachments, toolCalls: [], citations: [], createdAt: now() };
    const assistant: Message = { id: uid(), chatId, role: 'assistant', content: '', attachments: [], toolCalls: [], citations: opts.citations ?? [], createdAt: now() + 1 };
    // Both bubbles appear at once, so progress is visible from the first moment.
    setMsgs((l) => [...l, userMsg, assistant]);
    const isFirst = (get().messages[chatId] ?? []).length === 2;

    const update = (patch: Partial<Message>) => {
      Object.assign(assistant, patch);
      setMsgs((l) => l.map((m) => (m.id === assistant.id ? { ...assistant } : m)));
    };
    /** What the app is doing right now. Shown in the activity box until the first words arrive. */
    const act = (status?: string, detail?: string) =>
      update({ status, statusDetail: status ? detail : undefined, statusSince: status ? (assistant.status === status ? assistant.statusSince : now()) : undefined });

    if (!provider || !chat.modelId) {
      await saveMessage(userMsg);
      update({ error: 'No model selected. Add an endpoint in Providers.' });
      return;
    }

    const ctl = new AbortController();
    aborts.set(chatId, ctl);
    set((s) => ({ streaming: { ...s.streaming, [chatId]: true } }));
    void ensureNotifyPermission();
    let indexError = '';

    try {
      // Long text files go into the search index (embeddings endpoint); short ones are sent whole.
      for (const a of userMsg.attachments) {
        if (a.kind === 'file' && a.text && !a.indexed && !a.inline && shouldIndex(a.text)) {
          try {
            act(`Reading “${a.name}”…`, 'Splitting it into passages and indexing them for search');
            await indexFile(chatId, a.name, a.text);
            a.indexed = true;
            a.text = undefined;
          } catch (e: any) {
            indexError = e?.message ?? 'Could not index the file';
          }
        }
      }

      // The web-search chip / /search: look it up first and hand the results to the model.
      if (opts.search) {
        act('Searching the web…', `“${text.slice(0, 100)}”`);
        try {
          const hits = await webSearch(text);
          userMsg.attachments = [...userMsg.attachments, { id: uid(), kind: 'file', name: 'Web results', uri: '', inline: true, text: `Use these web results to answer; cite them as [n].\n\n${formatHits(hits)}` }];
          setMsgs((l) => l.map((m) => (m.id === userMsg.id ? { ...userMsg } : m)));
          update({ citations: hits.map((h) => ({ title: h.title, url: h.url })) });
        } catch (e: any) {
          Alert.alert('Web search failed', `${e?.message ?? 'Unknown error'}\n\nThe model will answer without it.`);
        }
      }
      await saveMessage(userMsg);
      if (isFirst) await get().patch(chatId, { title: initialTitle(text) });

      const lib = useLibrary.getState();
      const prompt = lib.prompts.find((p) => p.id === chat.promptId);
      // Skills: "Always" ones are in the prompt in full, "Automatic" ones are listed and loaded by the model when a task
      // matches (so many installed skills cost little), and "When I ask" ones only run through their /command.
      const on = lib.skills.filter((s) => s.enabled);
      const forced = on.filter((s) => opts.skills?.includes(s.id));
      const always = on.filter((s) => s.mode === 'always' && !forced.includes(s));
      const auto = on.filter((s) => s.mode === 'auto' && !forced.includes(s));
      // Files that came with a skill (references, templates, scripts) are listed so the model can open them.
      const fileLists = new Map<string, { path: string; size: number }[]>();
      for (const s of [...always, ...forced, ...auto]) if (s.fileCount > 0) fileLists.set(s.id, await lib.skillFiles(s.id));
      const skillText = (s: { id: string; name: string; description: string; body: string }) => `## Skill: ${s.name}\n${s.description}\n${s.body.slice(0, MAX_SKILL_CHARS)}${fileNote(fileLists.get(s.id) ?? [])}`;
      let ragContext = '';
      try {
        if ((get().messages[chatId] ?? []).some((m) => m.attachments.some((a) => a.indexed))) act('Searching your files…', 'Finding the passages that match your question');
        const hits = await retrieve(chatId, text);
        if (hits.length) ragContext = `Relevant excerpts from the user's attached files:\n${hits.map((h) => `[${h.file}]\n${h.text}`).join('\n\n')}`;
      } catch (e: any) {
        indexError ||= e?.message ?? '';
      }
      const system = [
        prompt ? applyVariables(prompt.body, prompt.variables, chat.modelId) : '',
        ...always.map(skillText),
        ...forced.map((s) => `The user chose the “${s.name}” skill for this message. Follow it.\n\n${skillText(s)}`),
        skillMenu(auto),
        genUiOn(chat.modelId, text, opts.ui) ? genUiSystemPrompt() : '',
        ragContext,
      ].filter(Boolean).join('\n\n');

      // Gather tools from the MCP servers enabled for this chat.
      const servers = lib.servers.filter((s) => chat.toolIds.includes(s.id) && s.connected);
      const toolMap = new Map<string, { server: McpServer; tool: McpServer['tools'][number] }>();
      const tools: ToolDef[] = [];
      for (const server of servers) {
        for (const tool of server.tools) {
          if (tool.policy === 'off') continue;
          // Function names are limited to 64 characters: shorten the server part, never the tool's own name.
          const fname = sanitize(`${server.name.slice(0, 24)}__${tool.name}`);
          toolMap.set(fname, { server, tool });
          tools.push({ type: 'function', function: { name: fname, description: tool.description, parameters: tool.schema ?? { type: 'object', properties: {} } } });
        }
      }

      if (fileLists.size) {
        tools.push({ type: 'function', function: { name: READ_SKILL_FILE, description: 'Read one of the files that belong to a skill (a reference document, template or script).', parameters: { type: 'object', properties: { skill: { type: 'string', description: 'The skill name' }, path: { type: 'string', description: 'The file path, as listed for the skill' } }, required: ['skill', 'path'] } } });
      }
      if (auto.length) {
        tools.push({ type: 'function', function: { name: USE_SKILL, description: 'Load the full instructions of one of your skills by name.', parameters: { type: 'object', properties: { name: { type: 'string', description: 'The skill name, exactly as listed' } }, required: ['name'] } } });
      }

      if (useSettings.getState().searchMode === 'auto') {
        tools.push({ type: 'function', function: { name: WEB_SEARCH, description: 'Search the web for current information. Returns numbered results with URLs; cite them as [n].', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } });
      }

      const toWire = (m: Message): ChatMessage => {
        // Whole files are capped so one big document can't overflow the model's context window.
        const inlineText = (a: Attachment) =>
          a.text && a.text.length > MAX_INLINE_CHARS
            ? `${a.text.slice(0, MAX_INLINE_CHARS)}\n[… ${(a.text.length - MAX_INLINE_CHARS).toLocaleString()} more characters not sent. Turn on “Search inside” in Files & documents to use the whole file.]`
            : a.text;
        const files = m.attachments.filter((a) => a.kind === 'file' && (a.text || a.indexed)).map((a) => (a.indexed ? `\n\n[File: ${a.name} — attached; relevant excerpts are in the system message]` : `\n\n[File: ${a.name}]\n${inlineText(a)}`)).join('');
        const imgs = m.attachments.filter((a) => a.kind === 'image');
        if (m.role === 'user' && imgs.length) {
          return { role: 'user', content: [{ type: 'text', text: m.content + files }, ...imgs.map((i) => ({ type: 'image_url' as const, image_url: { url: i.uri } }))] };
        }
        return { role: m.role, content: m.content + files };
      };

      const wire: ChatMessage[] = [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        ...get().messages[chatId].filter((m) => m.id !== assistant.id && !m.error).map(toWire),
      ];

      // Tool loop: model -> (tool calls -> results) -> model, capped to avoid runaway.
      for (let round = 0; round < 6; round++) {
        let pending: ToolCall[] = [];
        let roundText = '';
        act('Thinking…', round === 0 ? `Waiting for ${chat.modelId}` : 'Reading the tool results');
        for await (const ev of streamChat(provider, { model: chat.modelId, messages: wire, tools, params: chat.params, signal: ctl.signal })) {
          if (ev.type === 'delta') {
            roundText += ev.text;
            if (!assistant.content) haptic.soft();
            update({ content: assistant.content + ev.text, ...(assistant.status ? { status: undefined, statusDetail: undefined, statusSince: undefined } : {}) });
          } else if (ev.type === 'tool_calls') pending = ev.calls;
          else update({ tokens: (assistant.tokens ?? 0) + (ev.tokens ?? 0), ms: (assistant.ms ?? 0) + ev.ms });
        }
        if (!pending.length) break;

        wire.push({ role: 'assistant', content: roundText || null, tool_calls: pending });
        for (const call of pending) {
          if (call.function.name === READ_SKILL_FILE) {
            let a: { skill?: unknown; path?: unknown } = {};
            try {
              a = JSON.parse(call.function.arguments || '{}');
            } catch {
              /* the model sent broken JSON; the reply below lists what exists */
            }
            const hit = [...always, ...forced, ...auto].find((k) => k.name.toLowerCase() === String(a.skill ?? '').trim().toLowerCase());
            const path = normPath(String(a.path ?? ''));
            const run: ToolRun = { id: call.id, name: READ_SKILL_FILE, skill: `${hit?.name ?? String(a.skill ?? 'skill')} · ${path || '?'}`, args: call.function.arguments, status: 'running' };
            update({ toolCalls: [...assistant.toolCalls, run] });
            if (hit && path) act(`Reading ${path}…`, `From the “${hit.name}” skill`);
            const text = hit && path ? await lib.readSkillFile(hit.id, path) : null;
            const names = hit ? (fileLists.get(hit.id) ?? []).map((f) => f.path).join(', ') : '';
            const out =
              text != null
                ? text.length > MAX_SKILL_CHARS ? `${text.slice(0, MAX_SKILL_CHARS)}\n[… ${(text.length - MAX_SKILL_CHARS).toLocaleString('en-US')} more characters not shown]` : text
                : hit ? `Error: the skill "${hit.name}" has no file "${path}".${names ? ` Its files: ${names}.` : ''}` : `Error: there is no skill called "${String(a.skill ?? '')}".`;
            update({ toolCalls: assistant.toolCalls.map((t) => (t.id === run.id ? { ...t, status: text != null ? 'done' : 'error', result: text != null ? `Read ${text.length.toLocaleString('en-US')} characters.` : out, error: text != null ? undefined : out } : t)) });
            wire.push({ role: 'tool', tool_call_id: call.id, content: out });
            continue;
          }
          if (call.function.name === USE_SKILL) {
            let wanted = '';
            try {
              wanted = String(JSON.parse(call.function.arguments || '{}').name ?? '');
            } catch {
              /* the model sent broken JSON; the reply below lists the valid names */
            }
            const hit = auto.find((k) => k.name.toLowerCase() === wanted.trim().toLowerCase());
            const run: ToolRun = { id: call.id, name: USE_SKILL, skill: hit?.name ?? (wanted || 'skill'), args: call.function.arguments, status: 'running' };
            update({ toolCalls: [...assistant.toolCalls, run] });
            const out = hit
              ? `# ${hit.name}\n\n${hit.body.slice(0, MAX_SKILL_CHARS)}${fileNote(fileLists.get(hit.id) ?? [])}`
              : `Error: there is no skill called "${wanted}". Available skills: ${auto.map((k) => k.name).join(', ')}.`;
            if (hit) act(`Using the “${hit.name}” skill…`, hit.description.slice(0, 160));
            update({ toolCalls: assistant.toolCalls.map((t) => (t.id === run.id ? { ...t, status: hit ? 'done' : 'error', result: hit ? `Loaded ${hit.body.length.toLocaleString()} characters of instructions.` : out, error: hit ? undefined : out } : t)) });
            wire.push({ role: 'tool', tool_call_id: call.id, content: out });
            continue;
          }
          if (call.function.name === WEB_SEARCH) {
            const run: ToolRun = { id: call.id, name: WEB_SEARCH, args: call.function.arguments, status: 'running' };
            update({ toolCalls: [...assistant.toolCalls, run] });
            const done = (patch: Partial<ToolRun>) => update({ toolCalls: assistant.toolCalls.map((t) => (t.id === run.id ? { ...t, ...patch } : t)) });
            try {
              const q = (JSON.parse(call.function.arguments || '{}').query as string) ?? text;
              act('Searching the web…', `“${q.slice(0, 100)}”`);
              const hits = await webSearch(q);
              const offset = assistant.citations.length;
              update({ citations: [...assistant.citations, ...hits.map((h) => ({ title: h.title, url: h.url }))] });
              const out = formatHits(hits, offset);
              done({ status: 'done', result: out });
              wire.push({ role: 'tool', tool_call_id: call.id, content: out });
            } catch (e: any) {
              done({ status: 'error', error: e.message });
              wire.push({ role: 'tool', tool_call_id: call.id, content: `Error: ${e.message}` });
            }
            continue;
          }
          const entry = toolMap.get(call.function.name);
          const run: ToolRun = { id: call.id, name: entry?.tool.name ?? call.function.name, server: entry?.server.name, args: call.function.arguments, status: 'running' };
          update({ toolCalls: [...assistant.toolCalls, run] });
          const finish = (patch: Partial<ToolRun>) => update({ toolCalls: assistant.toolCalls.map((t) => (t.id === run.id ? { ...t, ...patch } : t)) });

          if (!entry) {
            finish({ status: 'error', error: 'Unknown tool' });
            wire.push({ role: 'tool', tool_call_id: call.id, content: 'Error: unknown tool' });
            continue;
          }
          if (entry.tool.policy === 'ask') {
            act('Waiting for your OK', `${entry.server.name}.${entry.tool.name}`);
            finish({ status: 'pending' });
            const ok = await new Promise<boolean>((resolve) => set({ approval: { chatId, run, resolve } }));
            set({ approval: null });
            if (!ok) {
              finish({ status: 'rejected' });
              wire.push({ role: 'tool', tool_call_id: call.id, content: 'The user declined this action.' });
              continue;
            }
            finish({ status: 'running' });
          }
          try {
            act(`Running ${entry.server.name}.${entry.tool.name}…`, call.function.arguments.slice(0, 120));
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            const result = await callTool({ url: entry.server.url, id: entry.server.id }, entry.tool.name, args);
            finish({ status: 'done', result });
            wire.push({ role: 'tool', tool_call_id: call.id, content: result });
          } catch (e: any) {
            finish({ status: 'error', error: e.message });
            wire.push({ role: 'tool', tool_call_id: call.id, content: `Error: ${e.message}` });
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        const msg = e?.status === 401 ? 'Endpoint rejected the key (401).' : e?.status ? `Endpoint error ${e.status}: ${e.message}` : 'Could not reach the endpoint.';
        update({ error: msg });
        await useProviders.getState().update(provider.id, { status: e?.status === 401 ? 'rejected' : 'offline' });
      }
    } finally {
      aborts.delete(chatId);
      set((s) => ({ streaming: { ...s.streaming, [chatId]: false } }));
      if (indexError && !assistant.error) update({ error: `File search is off for this message: ${indexError}` });
      await saveMessage(assistant);
      await get().patch(chatId, {});
      if (!assistant.error && assistant.content && useSettings.getState().autoReadAloud) {
        speak(assistant.content.replace(/<think>[\s\S]*?<\/think>/g, '')).catch(() => {});
      }
      if (assistant.error) haptic.error();
      else if (assistant.content) {
        haptic.success();
        void maybeRetitle(chatId);
      }
      if (!ctl.signal.aborted) {
        const title = get().chats.find((c) => c.id === chatId)?.title ?? '';
        if (assistant.error) void notifyReply(chatId, title, 'Couldn’t get a reply. Tap to see why.');
        else if (assistant.content) void notifyReply(chatId, title, previewOf(assistant.content) || 'Your reply is ready.');
      }
    }
  },
}));

