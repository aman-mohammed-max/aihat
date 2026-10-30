import { create } from 'zustand';

import { initialModelRuntime, transitionModelRuntime, type ModelRuntimeAction, type ModelRuntimeSnapshot } from '@/lib/local/model-runtime.mjs';

type State = ModelRuntimeSnapshot & { dispatch: (action: ModelRuntimeAction) => void };

export const useLocalInference = create<State>((set, get) => ({
  ...initialModelRuntime,
  dispatch: (action) => set((state) => ({ ...transitionModelRuntime(state, action), dispatch: get().dispatch })),
}));
