import { create } from 'zustand';

import * as haptic from '@/lib/haptics';
import { phoneRecognitionAvailable } from '@/lib/speechrec';
import { stopSpeaking } from '@/lib/tts';
import { toast } from '@/store/toast';
import { useSettings } from '@/store/settings';

export type DictationPhase = 'idle' | 'starting' | 'listening' | 'working';

type State = {
  phase: DictationPhase;
  engine: 'phone' | 'endpoint';
  /** What has been heard so far (phone engine only; the endpoint engine has no live text). */
  text: string;
  /** Microphone level, 0 to 1. */
  level: number;
  /** When listening began (for the timer). */
  startedAt: number;
  /** Translate the result into Settings › Voice & speech › Translate into. */
  translate: boolean;
  /** "Transcribing…", "Translating…" while working. */
  note: string;
  /** The buttons ask the running engine to stop (finish keeps the text, cancel throws it away). */
  signal: { n: number; kind: 'finish' | 'cancel' | null };
  begin: (o?: { translate?: boolean }) => void;
  finish: () => void;
  cancel: () => void;
  patch: (p: Partial<Omit<State, 'begin' | 'finish' | 'cancel' | 'patch' | 'reset'>>) => void;
  reset: () => void;
};

const IDLE = { phase: 'idle', text: '', level: 0, note: '', startedAt: 0 } as const;

export const useDictation = create<State>((set, get) => ({
  ...IDLE,
  engine: 'phone',
  translate: false,
  signal: { n: 0, kind: null },

  begin(o) {
    if (get().phase !== 'idle') return get().finish();
    const s = useSettings.getState();
    stopSpeaking(); // the microphone would hear a reply being read aloud
    haptic.tap();
    // No speech service on this phone (Expo Go, Siri & Dictation off, no Google speech service): use the endpoint instead.
    const fallback = s.dictationEngine === 'phone' && !phoneRecognitionAvailable();
    if (fallback) toast('Live dictation isn’t available on this phone, so your transcription endpoint is used');
    set({
      ...IDLE,
      phase: 'starting',
      engine: fallback ? 'endpoint' : s.dictationEngine,
      translate: o?.translate ?? s.translateTo !== 'English',
      signal: { n: get().signal.n + 1, kind: null },
    });
  },
  finish() {
    if (get().phase === 'idle' || get().phase === 'working') return;
    set((st) => ({ signal: { n: st.signal.n + 1, kind: 'finish' } }));
  },
  cancel() {
    if (get().phase === 'idle') return;
    haptic.select();
    set((st) => ({ signal: { n: st.signal.n + 1, kind: 'cancel' } }));
  },
  patch: (p) => set(p),
  reset: () => set({ ...IDLE }),
}));
