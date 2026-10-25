import { create } from 'zustand';

/** A short message shown over the chat (for example "Effort set to high"). */
type State = { id: number; text: string; show: (text: string) => void };

export const useToast = create<State>((set, get) => ({
  id: 0,
  text: '',
  show: (text) => set({ id: get().id + 1, text }),
}));

export const toast = (text: string) => useToast.getState().show(text);
