import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Linking, Share } from 'react-native';

import { ASPECTS } from '@/api/images';
import { listModels } from '@/api/openai';
import { useChats, generateTitle } from '@/store/chats';
import { useCommands } from '@/store/commands';
import { useDictation } from '@/store/dictation';
import { useDraft } from '@/store/draft';
import { useLibrary, type McpServer, type Skill } from '@/store/library';
import { isChatModel, useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { device } from '@/lib/device';

import { pickFiles } from './attach';
import { quickComplete, resolveChatModel } from './llm';
import { generateSystemPrompt } from './promptgen';
import { pick } from './pick';
import { submit } from './send';
import { skillCommandNames } from './skills';
import { speak, stopSpeaking } from './tts';

export type CommandCtx = {
  chatId?: string;
  /** Returns the open chat, creating one (and opening it) first when this is the empty "New chat" screen. */
  ensureChat: () => Promise<string>;
};

export type CommandGroup = 'Create' | 'This chat' | 'Model' | 'Write with the model' | 'Go to' | 'Yours' | 'Skills' | 'MCP servers';

export type Command = {
  name: string;
  aliases?: string[];
  summary: string;
  /** Usage hint shown after the name, e.g. "<idea>". */
  args?: string;
  group: CommandGroup;
  /** True when the command needs text after it, so the palette inserts "/name " instead of running it. */
  needsArgs?: boolean;
  /** A one-line status shown under the chat box while the command is being typed. */
  hint?: () => string;
  /** Opens a settings sheet for this command (shown as an Options button next to the hint). */
  options?: () => void;
  run: (args: string, ctx: CommandCtx) => Promise<void> | void;
  custom?: boolean;
  /** Set on commands generated from an installed skill or MCP server (they appear under their own filter in the list). */
  kind?: 'skill' | 'mcp';
  /** For those: the id of the skill or server the command belongs to. */
  ref?: string;
};

// ---------- parsing ----------

/** Pull `--key value` and `--flag` options out of the text after a command. */
export function parseFlags(args: string, valueFlags: string[], boolFlags: string[] = []) {
  const flags: Record<string, string | true> = {};
  let rest = args;
  for (const f of valueFlags) {
    const m = rest.match(new RegExp(`(?:^|\\s)--${f}(?:=|\\s+)(\\S+)`, 'i'));
    if (m) {
      flags[f] = m[1];
      rest = rest.replace(m[0], ' ');
    }
  }
  for (const f of boolFlags) {
    const m = rest.match(new RegExp(`(?:^|\\s)--${f}(?=\\s|$)`, 'i'));
    if (m) {
      flags[f] = true;
      rest = rest.replace(m[0], ' ');
    }
  }
  return { flags, rest: rest.replace(/\s+/g, ' ').trim() };
}

/** `/name rest of the message` → { name, args } (`/?` is help). Plain text and `//escaped` text return null. */
export function splitCommand(text: string): { name: string; args: string } | null {
  const m = text.match(/^\/(\?|[a-z0-9][a-z0-9_-]*)(?:\s+([\s\S]*))?$/i);
  return m ? { name: m[1].toLowerCase(), args: (m[2] ?? '').trim() } : null;
}

const fill = (template: string, input: string, model: string) =>
  template
    .replaceAll('{input}', input)
    .replaceAll('{date}', new Date().toLocaleDateString())
    .replaceAll('{model}', model);

// ---------- helpers ----------

const chatOf = (id?: string) => (id ? useChats.getState().chats.find((c) => c.id === id) : undefined);
const lastReply = (id?: string) => (id ? [...(useChats.getState().messages[id] ?? [])].reverse().find((m) => m.role === 'assistant' && m.content && !m.error) : undefined);
const strip = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

function setParam(ctx: CommandCtx, patch: Record<string, unknown>) {
  const c = chatOf(ctx.chatId);
  if (c) return useChats.getState().patch(c.id, { params: { ...c.params, ...patch } });
  const st = useSettings.getState();
  st.set({ defaultParams: { ...st.defaultParams, ...patch } });
}
const currentParams = (ctx: CommandCtx) => ({ ...useSettings.getState().defaultParams, ...(chatOf(ctx.chatId)?.params ?? {}) });

const EFFORTS = ['off', 'low', 'medium', 'high'] as const;

function findImageModel(spec: string) {
  const { models } = useProviders.getState();
  const imgs = models.filter((m) => m.caps.kind === 'image');
  const q = spec.toLowerCase();
  return (imgs.find((m) => m.id.toLowerCase() === q) ?? imgs.find((m) => m.id.toLowerCase().includes(q)))?.id ?? spec;
}

/** A command that asks the model something using a prompt template. No text after it falls back to the last reply. */
const ask = (name: string, summary: string, group: Command['group'], build: (args: string) => string, fallbackLastReply?: string, aliases?: string[]): Command => ({
  name, aliases, summary, group, args: fallbackLastReply ? '[text]' : '<text>', needsArgs: !fallbackLastReply,
  run: async (args, ctx) => {
    if (!args && !fallbackLastReply) return toast(`Add some text after /${name}`);
    const id = await ctx.ensureChat();
    if (!args && !lastReply(id)) return toast('There is no reply to work on yet. Add some text after the command.');
    await submit(id, args ? build(args) : fallbackLastReply!);
  },
});

// ---------- built-in commands ----------

export const BUILT_IN: Command[] = [
  // Create
  {
    name: 'image', aliases: ['imagine', 'img'], group: 'Create', args: '<idea> [--model id] [--ratio 16:9] [--n 2] [--raw]', needsArgs: true,
    summary: 'The chat model writes a detailed image prompt from your idea, then the image model draws it',
    hint: () => {
      const s = useSettings.getState();
      const model = (s.imageEngine === 'provider' ? s.routes.images.model : s.imageModel) || 'default model';
      return `Image model: ${model} · ratio ${s.imageAspect} · ${s.imageImprove ? 'prompt improved first (--raw to skip)' : 'prompt sent as typed'}`;
    },
    options: () => router.push('/image-options'),
    run: async (args, ctx) => {
      const { flags, rest } = parseFlags(args, ['model', 'ratio', 'n'], ['raw']);
      if (!rest) {
        toast('Describe the image, for example /image a cozy cabin in snow');
        return useDraft.getState().set({ text: '/image ' });
      }
      const ratio = flags.ratio as string | undefined;
      if (ratio && !(ratio in ASPECTS)) return toast(`Ratio must be one of ${Object.keys(ASPECTS).join(', ')}`);
      const id = await ctx.ensureChat();
      await useChats.getState().sendImage(id, rest, {
        refine: flags.raw ? false : true,
        model: typeof flags.model === 'string' ? findImageModel(flags.model) : undefined,
        aspect: ratio as keyof typeof ASPECTS | undefined,
        n: flags.n ? Math.min(Math.max(parseInt(String(flags.n), 10) || 1, 1), 4) : undefined,
      });
    },
  },
  {
    name: 'search', aliases: ['web'], group: 'Create', args: '<question>', needsArgs: true, summary: 'Search the web, then answer with sources',
    run: async (args, ctx) => {
      if (!args) return toast('Add a question after /search');
      await submit(await ctx.ensureChat(), args, { search: true });
    },
  },
  {
    name: 'ui', aliases: ['build'], group: 'Create', args: '<what to build>', needsArgs: true, summary: 'Reply with an interactive UI: a checklist, form, dashboard or small tool',
    run: async (args, ctx) => {
      if (!args) return toast('Say what to build, for example /ui a packing checklist');
      await submit(await ctx.ensureChat(), args, { ui: true });
    },
  },
  {
    name: 'prompt', aliases: ['newprompt'], group: 'Create', args: '<what the assistant should be>', needsArgs: true,
    summary: 'The model writes a new system prompt, saves it, and uses it in this chat',
    run: async (args, ctx) => {
      if (!args) return toast('Describe the assistant, for example /prompt a patient Rust tutor');
      toast('Writing your system prompt…');
      try {
        const id = await ctx.ensureChat();
        const { name, body } = await generateSystemPrompt(chatOf(id), args);
        const pid = await useLibrary.getState().savePrompt({ name, body, tags: ['generated'] });
        await useChats.getState().patch(id, { promptId: pid });
        toast(`Saved “${name}” and set it for this chat`);
        router.push({ pathname: '/prompt-edit', params: { id: pid } });
      } catch (e: any) {
        Alert.alert('Could not write the prompt', e?.message ?? 'Try again.');
      }
    },
  },

  // Model
  {
    name: 'effort', aliases: ['think', 'reasoning'], group: 'Model', args: '[off|low|medium|high]', summary: 'How much the model should think (reasoning effort), for providers that support it',
    hint: () => 'Effort is sent as reasoning_effort. Models without reasoning ignore it.',
    run: (args, ctx) => {
      const level = args.toLowerCase();
      const apply = (v: string) => {
        setParam(ctx, { reasoning: v });
        toast(`Reasoning effort: ${v}`);
      };
      if ((EFFORTS as readonly string[]).includes(level)) return apply(level);
      pick('Reasoning effort', EFFORTS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), note: v === 'off' ? 'Let the model decide' : undefined })), currentParams(ctx).reasoning ?? 'off', apply);
    },
  },
  {
    name: 'model', group: 'Model', args: '[name]', summary: 'Switch the chat model, or open the picker',
    run: async (args, ctx) => {
      const { models } = useProviders.getState();
      const chatModels = models.filter((m) => m.enabled && isChatModel(m));
      const q = args.toLowerCase();
      const hits = q ? chatModels.filter((m) => m.id.toLowerCase().includes(q)) : [];
      const exact = hits.find((m) => m.id.toLowerCase() === q);
      const choice = exact ?? (hits.length === 1 ? hits[0] : undefined);
      if (choice) {
        if (ctx.chatId) await useChats.getState().patch(ctx.chatId, { providerId: choice.providerId, modelId: choice.id });
        else useSettings.getState().set({ defaultProviderId: choice.providerId, defaultModelId: choice.id });
        return toast(`Model: ${choice.id}`);
      }
      if (q && !hits.length) toast(`No model matches “${args}”`);
      router.push({ pathname: '/model-sheet', params: ctx.chatId ? { chatId: ctx.chatId } : {} });
    },
  },
  {
    name: 'temp', aliases: ['temperature'], group: 'Model', args: '<0–2>', needsArgs: true, summary: 'Set the temperature (0 precise, 2 creative)',
    run: (args, ctx) => {
      const v = parseFloat(args);
      if (Number.isNaN(v) || v < 0 || v > 2) return toast('Temperature is a number from 0 to 2, for example /temp 0.7');
      setParam(ctx, { temperature: Math.round(v * 10) / 10 });
      toast(`Temperature: ${Math.round(v * 10) / 10}`);
    },
  },
  {
    name: 'system', aliases: ['persona'], group: 'Model', args: '[prompt name|none]', summary: 'Pick the system prompt for this chat',
    run: async (args, ctx) => {
      const { prompts } = useLibrary.getState();
      const q = args.toLowerCase();
      const setPrompt = async (id: string | null, label: string) => {
        if (ctx.chatId) await useChats.getState().patch(ctx.chatId, { promptId: id });
        else useSettings.getState().set({ defaultPromptId: id });
        toast(`System prompt: ${label}`);
      };
      if (q === 'none' || q === 'off') return setPrompt(null, 'none');
      const hit = q ? prompts.find((p) => p.name.toLowerCase().includes(q)) : undefined;
      if (hit) return setPrompt(hit.id, hit.name);
      if (q) toast(`No prompt matches “${args}”`);
      router.push({ pathname: '/prompt-sheet', params: ctx.chatId ? { chatId: ctx.chatId } : {} });
    },
  },
  {
    name: 'tools', group: 'Model', summary: 'Choose skills, MCP servers and web search for this chat',
    run: (_a, ctx) => router.push({ pathname: '/tools-sheet', params: ctx.chatId ? { chatId: ctx.chatId } : {} }),
  },
  {
    name: 'refresh', group: 'Model', summary: 'Fetch every endpoint’s model list again',
    run: async () => {
      toast('Refreshing models…');
      const r = await useProviders.getState().refreshAll();
      toast(r.failed.length ? `Couldn’t reach ${r.failed.join(', ')}` : `${r.total} models${r.added ? ` · ${r.added} new` : ''}`);
    },
  },

  // This chat
  { name: 'new', aliases: ['n'], group: 'This chat', summary: 'Start a new chat', run: () => { useDraft.getState().reset(); router.replace('/'); } },
  {
    name: 'clear', group: 'This chat', summary: 'Remove every message from this chat',
    run: (_a, ctx) => {
      const id = ctx.chatId;
      if (!id) return toast('Nothing to clear yet');
      Alert.alert('Clear this chat?', `Every message in it is removed from this ${device}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => useChats.getState().clear(id).then(() => toast('Chat cleared')) },
      ]);
    },
  },
  {
    name: 'rename', group: 'This chat', args: '<name>', summary: 'Rename this chat',
    run: async (args, ctx) => {
      if (!ctx.chatId) return toast('Send a message first, then rename the chat');
      if (!args) return router.push({ pathname: '/rename', params: { chatId: ctx.chatId } });
      await useChats.getState().patch(ctx.chatId, { title: args.slice(0, 80), titleLocked: true });
      toast('Renamed');
    },
  },
  {
    name: 'title', aliases: ['retitle'], group: 'This chat', summary: 'Let the model name this chat from what you discussed',
    run: async (_a, ctx) => {
      if (!ctx.chatId) return toast('Send a message first');
      const t = await generateTitle(ctx.chatId);
      if (!t) return toast('Couldn’t come up with a name');
      await useChats.getState().patch(ctx.chatId, { title: t, titleLocked: false });
      toast(`Named “${t}”`);
    },
  },
  {
    name: 'pin', group: 'This chat', summary: 'Pin or unpin this chat',
    run: async (_a, ctx) => {
      const c = chatOf(ctx.chatId);
      if (!c) return toast('Send a message first');
      await useChats.getState().patch(c.id, { pinned: !c.pinned });
      toast(c.pinned ? 'Unpinned' : 'Pinned to top');
    },
  },
  {
    name: 'archive', group: 'This chat', summary: 'Archive or unarchive this chat',
    run: async (_a, ctx) => {
      const c = chatOf(ctx.chatId);
      if (!c) return toast('Send a message first');
      await useChats.getState().patch(c.id, { archived: !c.archived });
      toast(c.archived ? 'Unarchived' : 'Archived');
    },
  },
  {
    name: 'delete', group: 'This chat', summary: 'Delete this chat',
    run: (_a, ctx) => (ctx.chatId ? router.push({ pathname: '/delete-chat', params: { chatId: ctx.chatId } }) : toast('Nothing to delete yet')),
  },
  {
    name: 'copy', group: 'This chat', summary: 'Copy the last reply',
    run: async (_a, ctx) => {
      const m = lastReply(ctx.chatId);
      if (!m) return toast('No reply to copy yet');
      await Clipboard.setStringAsync(strip(m.content));
      toast('Copied the last reply');
    },
  },
  { name: 'retry', aliases: ['regenerate'], group: 'This chat', summary: 'Answer the last message again', run: (_a, ctx) => (ctx.chatId ? useChats.getState().regenerate(ctx.chatId) : toast('Nothing to retry yet')) },
  {
    name: 'export', group: 'This chat', summary: 'Share this chat as Markdown',
    run: async (_a, ctx) => {
      const c = chatOf(ctx.chatId);
      if (!c) return toast('Nothing to export yet');
      const md = `# ${c.title}\n\n` + (useChats.getState().messages[c.id] ?? []).map((m) => `**${m.role === 'user' ? 'You' : 'Assistant'}**\n\n${strip(m.content)}`).join('\n\n---\n\n');
      await Share.share({ message: md, title: c.title });
    },
  },
  {
    name: 'read', aliases: ['speak'], group: 'This chat', summary: 'Read the last reply aloud',
    run: async (_a, ctx) => {
      const m = lastReply(ctx.chatId);
      if (!m) return toast('No reply to read yet');
      try {
        await speak(strip(m.content));
      } catch (e: any) {
        Alert.alert('Could not read aloud', e?.message ?? 'Try again.');
      }
    },
  },
  { name: 'stop', group: 'This chat', summary: 'Stop reading aloud, or stop the reply in progress', run: (_a, ctx) => { stopSpeaking(); if (ctx.chatId) useChats.getState().stop(ctx.chatId); } },
  { name: 'voice', aliases: ['mic', 'dictate'], group: 'This chat', summary: 'Dictate a message (live text from the phone)', run: () => useDictation.getState().begin() },
  {
    name: 'files', aliases: ['attach'], group: 'This chat', summary: 'Attach files (text, Markdown, CSV, code, PDF, Word, PowerPoint)',
    run: async () => {
      const files = await pickFiles();
      files.forEach(useDraft.getState().addFile);
    },
  },

  {
    name: 'status', group: 'This chat', summary: 'Show the model, endpoint, tools and skills this chat is using',
    run: (_a, ctx) => {
      const c = chatOf(ctx.chatId);
      const { provider, modelId } = resolveChatModel(c);
      const lib = useLibrary.getState();
      const st = useSettings.getState();
      const p = { ...st.defaultParams, ...(c?.params ?? {}) };
      const on = lib.skills.filter((s) => s.enabled);
      const servers = lib.servers.filter((s) => c?.toolIds.includes(s.id) && s.connected);
      Alert.alert('Status', [
        `Model: ${modelId ?? 'none'}${provider ? ` (${provider.name})` : ''}`,
        `Thinking: ${p.reasoning ?? 'off'} · temperature ${p.temperature ?? 0.7}`,
        `Tools on: ${servers.length ? servers.map((s) => s.name).join(', ') : 'none'}`,
        `Skills: ${on.length} on (${on.filter((s) => s.mode === 'auto').length} automatic, ${on.filter((s) => s.mode === 'always').length} always)`,
        `Web search: ${st.searchMode}`,
        `Messages in this chat: ${(c ? useChats.getState().messages[c.id] ?? [] : []).length}`,
      ].join('\n'));
    },
  },
  {
    name: 'usage', aliases: ['cost', 'tokens'], group: 'This chat', summary: 'Tokens and time used in this chat (as the endpoint reports them)',
    run: (_a, ctx) => {
      const list = ctx.chatId ? useChats.getState().messages[ctx.chatId] ?? [] : [];
      const replies = list.filter((m) => m.role === 'assistant');
      const tokens = replies.reduce((n, m) => n + (m.tokens ?? 0), 0);
      const ms = replies.reduce((n, m) => n + (m.ms ?? 0), 0);
      if (!replies.length) return toast('No replies yet');
      Alert.alert('Usage in this chat', `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}\n${tokens ? `${tokens.toLocaleString()} tokens written` : 'The endpoint did not report token counts'}\n${(ms / 1000).toFixed(1)} s of generating\n\nPrices depend on your provider, so no cost is shown.`);
    },
  },
  {
    name: 'compact', aliases: ['condense'], group: 'This chat', args: '[focus]', summary: 'Summarise this chat and continue in a fresh chat that starts from the summary',
    run: async (args, ctx) => {
      const c = chatOf(ctx.chatId);
      const list = (c ? useChats.getState().messages[c.id] ?? [] : []).filter((m) => m.content && !m.error);
      if (!c || list.length < 2) return toast('There is nothing to summarise yet');
      toast('Summarising…');
      try {
        const transcript = list.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${strip(m.content)}`).join('\n\n').slice(-60_000);
        const summary = await quickComplete({
          chat: c,
          system: 'You condense a conversation so it can continue in a fresh chat. Keep decisions, facts, names, numbers, code identifiers, open questions and what the user wants next. Plain Markdown, under 400 words. No preamble.',
          user: `${args ? `Focus on: ${args}\n\n` : ''}${transcript}`,
          maxTokens: 800,
          temperature: 0.2,
        });
        if (!summary) throw new Error('The model returned nothing.');
        const id = await useChats.getState().create({ title: `${c.title} (summary)`, providerId: c.providerId, modelId: c.modelId, promptId: c.promptId, params: c.params, toolIds: c.toolIds });
        await useChats.getState().addAssistantMessage(id, `**Summary of the earlier chat**\n\n${summary}`);
        router.replace(`/chat/${id}`);
      } catch (e: any) {
        Alert.alert('Could not summarise', e?.message ?? 'Try again.');
      }
    },
  },
  {
    name: 'fork', aliases: ['branch'], group: 'This chat', summary: 'Copy this chat into a new one and continue from there',
    run: async (_a, ctx) => {
      const last = ctx.chatId ? [...(useChats.getState().messages[ctx.chatId] ?? [])].pop() : undefined;
      if (!ctx.chatId || !last) return toast('Nothing to fork yet');
      router.replace(`/chat/${await useChats.getState().branch(ctx.chatId, last.id)}`);
    },
  },
  {
    name: 'doctor', group: 'Model', summary: 'Check that the endpoint answers, and how fast',
    run: async (_a, ctx) => {
      const { provider } = resolveChatModel(chatOf(ctx.chatId));
      if (!provider) return toast('Add an endpoint first');
      toast(`Checking ${provider.name}…`);
      try {
        const r = await listModels(provider);
        Alert.alert(`${provider.name} is reachable`, `${r.ids.length} models listed · ${r.latencyMs} ms`);
      } catch (e: any) {
        Alert.alert(`${provider.name} didn’t answer`, e?.message ?? 'Check the address and your connection.');
      }
    },
  },

  // Write with the model (prompt templates)
  ask('summarize', 'Summarize this conversation (or the text you give)', 'Write with the model', (a) => `Summarize this in a few short bullet points:\n\n${a}`, 'Summarize our conversation so far in a few short bullet points.', ['recap']),
  {
    name: 'translate', aliases: ['tr'], group: 'Write with the model', args: '<language> [: text]', needsArgs: true,
    summary: 'Translate your last reply into a language, or translate the text after a colon',
    run: async (args, ctx) => {
      if (!args) return toast('Say the language, for example /translate Hindi');
      const [lang, ...rest] = args.split(':');
      const text = rest.join(':').trim();
      const id = await ctx.ensureChat();
      if (!text && !lastReply(id)) return toast('There is no reply to translate yet. Try /translate Hindi: your text');
      const keep = 'Keep formatting, code and names unchanged.';
      await submit(id, text ? `Translate this into ${lang.trim()}. ${keep}\n\n${text}` : `Translate your last reply into ${lang.trim()}. ${keep}`);
    },
  },
  ask('explain', 'Explain text simply (no text: explain the last reply more simply)', 'Write with the model', (a) => `Explain this clearly and simply:\n\n${a}`, 'Explain your last reply more simply, with an example.'),
  ask('tldr', 'A three-bullet TL;DR of the text (no text: of the last reply)', 'Write with the model', (a) => `Give a TL;DR of this in 3 bullets at most:\n\n${a}`, 'Give a TL;DR of your last reply in 3 bullets at most.'),
  ask('fix', 'Find and fix problems in code or text', 'Write with the model', (a) => `Find and fix the problems in this. Show the corrected version first, then a short list of what changed:\n\n${a}`),
  ask('review', 'Review code or writing, most important issues first', 'Write with the model', (a) => `Review this for bugs, unclear parts and improvements. List findings from most to least important:\n\n${a}`),
  ask('proofread', 'Fix spelling and grammar only', 'Write with the model', (a) => `Proofread this. Fix spelling and grammar only, keep my wording and tone, then list the changes:\n\n${a}`),
  ask('rewrite', 'Rewrite text to be clearer and shorter', 'Write with the model', (a) => `Rewrite this to be clearer and shorter. Keep the meaning and my voice:\n\n${a}`),
  ask('eli5', 'Explain like I’m five', 'Write with the model', (a) => `Explain like I'm five: ${a}`),
  ask('brainstorm', 'Ten different ideas for something', 'Write with the model', (a) => `Brainstorm 10 distinct ideas for: ${a}. Make them different from each other, one line each.`),
  ask('plan', 'A step-by-step plan with risks', 'Write with the model', (a) => `Make a step-by-step plan for: ${a}. Say what to do first and list the main risks.`),
  ask('proscons', 'Pros, cons and a recommendation', 'Write with the model', (a) => `List the pros and cons of: ${a}. Then give a clear recommendation.`),

  // Go to
  { name: 'settings', group: 'Go to', summary: 'Open Settings', run: () => router.push('/settings') },
  { name: 'resume', aliases: ['history', 'chats'], group: 'Go to', summary: 'Find and reopen an earlier chat', run: () => router.push('/search-chats') },
  {
    name: 'theme', group: 'Go to', args: '[dark|light|system]', summary: `Switch between dark, light and the ${device}’s setting`,
    run: (args) => {
      const st = useSettings.getState();
      const order = ['system', 'dark', 'light'] as const;
      const want = args.trim().toLowerCase();
      const next = (order as readonly string[]).includes(want) ? (want as (typeof order)[number]) : order[(order.indexOf(st.mode) + 1) % order.length];
      st.set({ mode: next });
      toast(`Theme: ${next}`);
    },
  },
  { name: 'feedback', aliases: ['bug'], group: 'Go to', summary: 'Report a problem or suggest something (opens GitHub)', run: () => void Linking.openURL('https://github.com/aman-mohammed-max/aihat/issues/new/choose') },
  { name: 'providers', aliases: ['endpoints'], group: 'Go to', summary: 'Manage endpoints and models', run: () => router.push('/providers') },
  { name: 'prompts', group: 'Go to', summary: 'Your system prompts', run: () => router.push('/prompts') },
  { name: 'skills', group: 'Go to', summary: 'Your skills (each also works as its own /command)', run: () => router.push('/skills') },
  { name: 'mcp', group: 'Go to', summary: 'MCP servers (each also works as its own /command)', run: () => router.push('/mcp') },
  { name: 'market', aliases: ['marketplace', 'store', 'browse'], group: 'Go to', summary: 'Browse and add skills and MCP servers', run: () => router.push('/market') },
  { name: 'commands', aliases: ['help', '?'], group: 'Go to', summary: 'All commands, and your own', run: () => router.push('/commands') },
];

// ---------- registry ----------

const brief = (t: string, n = 110) => {
  const one = t.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** `/pdf fill in this form`: one command per turned-on skill. It loads that skill in full for the message. */
function skillCommands(skills: Skill[], taken: Set<string>): Command[] {
  const on = skills.filter((s) => s.enabled);
  const names = skillCommandNames(on, taken, 'skill');
  return on.map((s) => {
    const name = names.get(s.id)!;
    return {
      name, kind: 'skill', ref: s.id, group: 'Skills', args: '<what to do>', needsArgs: true,
      summary: brief(s.description || `Use the ${s.name} skill`),
      run: async (args, ctx) => {
        if (!args) return toast(`Say what to do after /${name}`);
        await submit(await ctx.ensureChat(), args, { skills: [s.id] });
      },
    };
  });
}

/** `/github list my open pull requests`: turns that server's tools on for this chat, then asks. `/github off` turns them off. */
function serverCommands(servers: McpServer[], taken: Set<string>): Command[] {
  const names = skillCommandNames(servers, taken, 'mcp');
  return servers.map((s) => {
    const name = names.get(s.id)!;
    const usable = s.tools.filter((t) => t.policy !== 'off').length;
    return {
      name, kind: 'mcp', ref: s.id, group: 'MCP servers', args: '[what to do | off]', needsArgs: false,
      summary: s.connected ? `${s.name} · ${usable} tool${usable === 1 ? '' : 's'}. Turns them on for this chat.` : `${s.name} isn’t connected yet. Tap to set it up.`,
      run: async (args, ctx) => {
        const server = useLibrary.getState().servers.find((x) => x.id === s.id);
        if (!server) return;
        if (!server.connected) {
          toast(`${server.name} isn’t connected yet`);
          return router.push({ pathname: '/mcp-detail', params: { id: server.id } });
        }
        const id = await ctx.ensureChat();
        const chat = chatOf(id);
        if (!chat) return;
        if (/^(off|stop|disable)$/i.test(args)) {
          await useChats.getState().patch(id, { toolIds: chat.toolIds.filter((t) => t !== server.id) });
          return toast(`${server.name} tools are off for this chat`);
        }
        if (!chat.toolIds.includes(server.id)) await useChats.getState().patch(id, { toolIds: [...chat.toolIds, server.id] });
        if (!args) return toast(`${server.name} tools are on for this chat`);
        await submit(id, args);
      },
    };
  });
}

/** Built-in commands, the user's own, and one command for each skill and MCP server. A custom command with the same name replaces a built-in one. */
export function allCommands(
  custom = useCommands.getState().items,
  skills: Skill[] = useLibrary.getState().skills,
  servers: McpServer[] = useLibrary.getState().servers,
): Command[] {
  const mine: Command[] = custom.map((c) => ({
    name: c.name, group: 'Yours', custom: true, args: c.template.includes('{input}') ? '<text>' : '[text]',
    summary: c.description || c.template.replace(/\s+/g, ' ').slice(0, 70),
    needsArgs: c.mode === 'insert' ? false : c.template.includes('{input}'),
    run: async (args, ctx) => {
      const model = useSettings.getState().defaultModelId ?? '';
      const text = c.template.includes('{input}') ? fill(c.template, args, model) : args ? `${fill(c.template, '', model)}\n\n${args}` : fill(c.template, '', model);
      if (c.mode === 'insert') return useDraft.getState().set({ text });
      await submit(await ctx.ensureChat(), text);
    },
  }));
  const names = new Set(mine.map((c) => c.name));
  const base = [...mine, ...BUILT_IN.filter((c) => !names.has(c.name))];
  const taken = new Set(base.flatMap((c) => [c.name, ...(c.aliases ?? [])]));
  const fromSkills = skillCommands(skills, taken);
  fromSkills.forEach((c) => taken.add(c.name));
  return [...base, ...fromSkills, ...serverCommands(servers, taken)];
}

export const findCommand = (name: string, list = allCommands()) => list.find((c) => c.name === name || c.aliases?.includes(name));

export { matchCommands } from './commandmatch';

/** React hook: the merged command list, updating when custom commands change. */
export function useCommandList() {
  const items = useCommands((s) => s.items);
  const skills = useLibrary((s) => s.skills);
  const servers = useLibrary((s) => s.servers);
  return useMemo(() => allCommands(items, skills, servers), [items, skills, servers]);
}

/** Run `/name args` if it is a known command. Returns false when the text is just a message. */
export async function runCommandText(text: string, ctx: CommandCtx): Promise<boolean> {
  const parsed = splitCommand(text.trim());
  if (!parsed) return false;
  const cmd = findCommand(parsed.name);
  if (!cmd) return false;
  await cmd.run(parsed.args, ctx);
  return true;
}

