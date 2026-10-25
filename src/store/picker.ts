import { create } from 'zustand';

// Choice picker (any value row in settings opens it). Routes can't carry callbacks, so the opener registers one here.
export type PickerOption = { value: string; label: string; note?: string };
type State = {
  title: string; options: PickerOption[]; selected: string; searchable: boolean;
  onPick: ((v: string) => void) | null;
  open: (p: { title: string; options: PickerOption[]; selected: string; searchable?: boolean; onPick: (v: string) => void }) => void;
};
export const usePicker = create<State>((set) => ({
  title: '', options: [], selected: '', searchable: false, onPick: null,
  open: (p) => set({ ...p, searchable: p.searchable ?? p.options.length > 8 }),
}));
