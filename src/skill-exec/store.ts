import { create } from 'zustand';

export type RuntimeStatus = 'unknown' | 'none' | 'downloading' | 'ready' | 'error';

type RuntimeState = {
  /** Phone: whether the add-on is downloaded. Computer: always ready (it uses the computer's own Python and Node). */
  status: RuntimeStatus;
  /** Bytes downloaded so far, and in all. */
  done: number;
  total: number;
  error?: string;
  /** Phone: copying the add-on into the sandbox, the first time it starts (bytes). */
  preparing: { done: number; total: number } | null;
  /** The sandbox has Python running (no start-up wait for the next script). */
  warm: boolean;
  /** How long the last start-up took (ms). */
  coldMs?: number;
  /** Computer: the Python and Node versions found, or null. */
  tools?: { python: string | null; node: string | null };
  set: (p: Partial<RuntimeState>) => void;
};

export const useSkillRuntime = create<RuntimeState>((set) => ({
  status: 'unknown',
  done: 0,
  total: 0,
  preparing: null,
  warm: false,
  set: (p) => set(p),
}));
