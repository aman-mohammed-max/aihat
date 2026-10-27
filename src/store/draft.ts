import { create } from 'zustand';

import type { Attachment } from './chats';

// Composer state shared between the chat screen and the Add (+) / Tools sheets.
type Draft = {
  text: string;
  files: Attachment[];
  searchOn: boolean;
  imageOn: boolean;
  /** Memory preference for the first turn of a new chat, before that chat has been created. */
  memoryOn: boolean;
  uiOn: boolean;
  set: (p: Partial<Omit<Draft, 'set' | 'addFile' | 'removeFile' | 'reset'>>) => void;
  addFile: (f: Attachment) => void;
  removeFile: (id: string) => void;
  reset: () => void;
};

export const useDraft = create<Draft>((set) => ({
  text: '',
  files: [],
  searchOn: false,
  imageOn: false,
  memoryOn: true,
  uiOn: false,
  set: (p) => set(p),
  addFile: (f) => set((s) => ({ files: [...s.files, f] })),
  removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  reset: () => set({ text: '', files: [], memoryOn: true }),
}));
