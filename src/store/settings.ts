import { create } from 'zustand';

import { getDb, json } from '@/db';
import type { ButtonShape, TextSize, ThemeMode } from '@/theme/tokens';

import type { Params } from '@/api/openai';

/** Which added provider serves a job. `providerId: null` means the default provider. */
export type Route = { providerId: string | null; model: string };
export type Capability = 'images' | 'speech' | 'transcription' | 'embeddings' | 'search';

export type Settings = {
  welcomed: boolean;
  // Appearance
  mode: ThemeMode;
  accent: string;
  buttonShape: ButtonShape;
  textSize: TextSize;
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
  haptics: boolean;
  /** A notification when a reply finishes and you are not looking at that chat. */
  notifyReplies: boolean;
  archiveDays: number;
  tempByDefault: boolean;
  // Audio
  /** Per-feature endpoint routing (images, speech, transcription, embeddings, /v1/search). */
  routes: Record<Capability, Route>;
  translateTo: string;
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
};

export const DEFAULT_SETTINGS: Settings = {
  welcomed: false,
  mode: 'dark',
  accent: '#C6F46B',
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
  haptics: true,
  notifyReplies: true,
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
    set(patch);
    const { loaded: _l, set: _s, load: _ld, ...settings } = get();
    getDb()
      .then((db) => db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', 'settings', JSON.stringify(settings)))
      .catch(() => {});
  },

  load: async () => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', 'settings');
    const saved = json<Partial<Omit<Settings, 'imageEngine'>> & { imageEngine?: string }>(row?.value, {});
    // Older builds saved 'openai' for the OpenAI-compatible image engine.
    if (saved.imageEngine === 'openai') saved.imageEngine = 'provider';
    set({
      ...DEFAULT_SETTINGS,
      ...(saved as Partial<Settings>),
      routes: { ...DEFAULT_SETTINGS.routes, ...(saved.routes ?? {}) },
      loaded: true,
    });
  },
}));
