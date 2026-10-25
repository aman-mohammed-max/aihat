import { create } from 'zustand';

/** What the read-aloud player is doing right now. The SpeechBar and Read-aloud buttons read this. */
type State = {
  status: 'idle' | 'loading' | 'playing' | 'paused';
  /** Whether the current engine can pause (the phone's own voice can't pause on Android). */
  canPause: boolean;
  set: (p: Partial<Omit<State, 'set'>>) => void;
};

export const useSpeech = create<State>((set) => ({ status: 'idle', canPause: true, set: (p) => set(p) }));
