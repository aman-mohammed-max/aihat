import { create } from 'zustand';

import { getDb, json } from '@/db';
import { defaultAccent, type ButtonShape, type TextSize, type ThemeMode } from '@/theme/tokens';

import type { Params } from '@/api/openai';

export type MemoryItem = { id: string; title: string; text: string; createdAt: number };

/** Which added provider serves a job. `providerId: null` means the default provider. */
export type Route = { providerId: string | null; model: string };
export type Capability = 'images' | 'speech' | 'transcription' | 'embeddings' | 'search';

export type Settings = {
  welcomed: boolean;
  // Appearance
  mode: ThemeMode;
  accent: string;
  /** Android 12+: take the accent colours from the wallpaper (Material You) instead of `accent`. */
  materialYou: boolean;
  buttonShape: ButtonShape;
  textSize: TextSize;
  /** Tablet and desktop: the side menu folded down to its icon rail. */
  sidebarCollapsed: boolean;
  /** Wide windows (1280 px and up): show a reply's sources in a panel beside the chat. */
  sourcesPanel: boolean;
  // Chat defaults
  defaultProviderId: string | null;
  defaultModelId: string | null;
  defaultPromptId: string | null;
  defaultParams: Params;
  autoTitle: boolean;
  titleModelId: string | null;
  sendWithEnter: boolean;
  showStats: boolean;
  showReasoning: boolean;
  /** Use saved personal context in chats with any configured provider. */
  memoryEnabled: boolean;
  /** On models without tool calling, optionally use a second request to save memories. */
  memoryFallbackEnabled: boolean;
  /** Optional model used by the memory fallback. Empty uses the chat's model. */
  memoryFallbackRoute: Route;
  memoryItems: MemoryItem[];
  /** Invalidates a memory suggestion when the user changes memory settings while it is running. */
  memoryRevision: number;
  haptics: boolean;
  /** A notification when a reply finishes and you are not looking at that chat. */
  notifyReplies: boolean;
  archiveDays: number;
  tempByDefault: boolean;
  // Audio
  /** Per-feature endpoint routing (images, speech, transcription, embeddings, /v1/search). */
  routes: Record<Capability, Route>;
  translateTo: string;
  /** Dictation (mic button): the phone's own recognizer shows live text; the endpoint records, then transcribes. */
  dictationEngine: 'phone' | 'endpoint';
  /** BCP-47 tag for the phone recognizer, or '' for the phone's own language. */
  dictationLang: string;
  /** Never send dictation audio to Apple or Google; refuse when the phone can't do it locally. */
  dictationOnDevice: boolean;
  ttsEngine: 'device' | 'endpoint';
  ttsVoice: string;
  autoReadAloud: boolean;
  // Images
  imageEngine: 'provider' | 'comfyui' | 'a1111';
  imageUrl: string;
  imageModel: string;
  imageWorkflow: string;
  imageNegative: string;
  /** Let the chat model rewrite an image idea into a detailed prompt before generating. */
  imageImprove: boolean;
  imageAspect: '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
  imageCount: number;
  // Web search
  searchMode: 'off' | 'ask' | 'auto';
  searchEngine: 'provider' | 'searxng' | 'brave' | 'tavily';
  searchUrl: string;
  searchResults: number;
  searchFullPages: boolean;
  searchSafe: boolean;
  searchBlocklist: string;
  // Files
  fileMode: 'whole' | 'rag';
  embeddingModel: string;
  chunkSize: number;
  topK: number;
  ocr: boolean;
  maxFileMb: number;
  // Backup
  backupTarget: 'drive' | 'icloud' | 'file';
  backupInclude: { chats: boolean; prompts: boolean; skills: boolean; mcp: boolean; settings: boolean };
  backupSchedule: 'off' | 'daily' | 'weekly';
  lastBackupAt: number;
  // Privacy
  appLock: boolean;
  hideInSwitcher: boolean;
  cloudWarning: boolean;
  // Generative UI
  genUi: boolean;
  /** When the UI instructions are sent: when the message asks for one, always, or only with the UI chip. */
  genUiMode: 'auto' | 'always' | 'chip';
  genUiConfirmWrites: boolean;
  genUiScope: 'chat' | 'apps';
  genUiInvalid: 'text' | 'retry';
  developerMode: boolean;
  genUiDisabledModels: string[];
  // Skill scripts
  /** Skills may run their own Python and Node scripts (phone: in the downloaded sandbox; computer: with its Python). */
  skillScripts: boolean;
  /** Ask before each script runs. */
  skillScriptsAsk: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  welcomed: false,
  mode: 'dark',
  accent: defaultAccent,
  materialYou: false,
  sidebarCollapsed: false,
  sourcesPanel: true,
  buttonShape: 'pill',
  textSize: 'default',
  defaultProviderId: null,
  defaultModelId: null,
  defaultPromptId: null,
  defaultParams: { temperature: 0.7, maxTokens: 4096, topP: 0.95, reasoning: 'off', stream: true },
  autoTitle: true,
  titleModelId: null,
  sendWithEnter: false,
  showStats: true,
  showReasoning: true,
  memoryEnabled: true,
  memoryFallbackEnabled: true,
  memoryFallbackRoute: { providerId: null, model: '' },
  memoryItems: [],
  memoryRevision: 0,
  haptics: true,
  notifyReplies: true,
  skillScripts: false,
  skillScriptsAsk: true,
  archiveDays: 0,
  tempByDefault: false,
  routes: {
    images: { providerId: null, model: '' },
    speech: { providerId: null, model: '' },
    transcription: { providerId: null, model: 'whisper-1' },
    embeddings: { providerId: null, model: '' },
    search: { providerId: null, model: '' },
  },
  translateTo: 'English',
  dictationEngine: 'phone',
  dictationLang: '',
  dictationOnDevice: false,
  ttsEngine: 'device',
  ttsVoice: '',
  autoReadAloud: false,
  imageEngine: 'provider',
  imageUrl: 'http://localhost:8188',
  imageModel: '',
  imageWorkflow: '',
  imageNegative: 'blurry, low quality',
  imageImprove: true,
  imageAspect: '1:1',
  imageCount: 1,
  searchMode: 'ask',
  searchEngine: 'searxng',
  searchUrl: 'http://localhost:8080',
  searchResults: 6,
  searchFullPages: false,
  searchSafe: true,
  searchBlocklist: '',
  fileMode: 'rag',
  embeddingModel: '',
  chunkSize: 800,
  topK: 5,
  ocr: false,
  maxFileMb: 50,
  backupTarget: 'file',
  backupInclude: { chats: true, prompts: true, skills: true, mcp: true, settings: true },
  backupSchedule: 'off',
  lastBackupAt: 0,
  appLock: false,
  hideInSwitcher: false,
  cloudWarning: true,
  genUi: true,
  genUiMode: 'auto',
  genUiConfirmWrites: true,
  genUiScope: 'apps',
  genUiInvalid: 'text',
  developerMode: false,
  genUiDisabledModels: [],
};

type Store = Settings & {
  loaded: boolean;
  set: (patch: Partial<Settings>) => void;
  load: () => Promise<void>;
};

export const useSettings = create<Store>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  set: (patch) => {
    const memoryChanged = 'memoryItems' in patch || 'memoryEnabled' in patch || 'memoryFallbackEnabled' in patch || 'memoryFallbackRoute' in patch;
    set({ ...patch, ...(memoryChanged ? { memoryRevision: get().memoryRevision + 1 } : {}) });
    const { loaded: _l, set: _s, load: _ld, ...settings } = get();
    getDb()
      .then((db) => db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', 'settings', JSON.stringify(settings)))
      .catch(() => {});
  },

  load: async () => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', 'settings');
    const saved = json<Partial<Omit<Settings, 'imageEngine'>> & { imageEngine?: string; memoryAutoSave?: boolean }>(row?.value, {});
    const fallbackDefault = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', 'memory_auto_save_default_on_v1');
    const applyMemoryFallbackDefault = !fallbackDefault;
    // Older builds saved 'openai' for the OpenAI-compatible image engine.
    if (saved.imageEngine === 'openai') saved.imageEngine = 'provider';
    const { memoryAutoSave: _legacyMemoryAutoSave, ...currentSaved } = saved;
    const memoryItems = Array.isArray(currentSaved.memoryItems)
      ? currentSaved.memoryItems.slice(0, 40).flatMap((item, index) => {
          if (!item || typeof item !== 'object' || typeof item.text !== 'string') return [];
          const text = item.text.trim().slice(0, 280);
          if (!text) return [];
          const title = typeof item.title === 'string' && item.title.trim()
            ? item.title.trim().slice(0, 72)
            : text.split(/[.!?\n]/, 1)[0].trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 72) || 'Saved memory';
          return [{ id: typeof item.id === 'string' && item.id ? item.id : `memory-${index}`, title, text, createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now() }];
        })
      : [];
    const loadedSettings: Settings = {
      ...DEFAULT_SETTINGS,
      ...(currentSaved as Partial<Settings>),
      memoryItems,
      memoryFallbackRoute: { ...DEFAULT_SETTINGS.memoryFallbackRoute, ...(currentSaved.memoryFallbackRoute ?? {}) },
      routes: { ...DEFAULT_SETTINGS.routes, ...(currentSaved.routes ?? {}) },
      ...(applyMemoryFallbackDefault ? { memoryFallbackEnabled: true } : {}),
    };
    set({ ...loadedSettings, loaded: true });
    if (applyMemoryFallbackDefault) {
      await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', 'settings', JSON.stringify(loadedSettings));
      await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', 'memory_auto_save_default_on_v1', '1');
    }
  },
}));
