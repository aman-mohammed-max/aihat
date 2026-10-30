export type ModelRuntimeAction =
  | { type: 'load-start'; id: string }
  | { type: 'load-success'; id: string; backendLabel?: string; fallbackReason?: string }
  | { type: 'load-failure'; id: string; error: string }
  | { type: 'unloaded'; id: string }
  | { type: 'remove-start'; id: string }
  | { type: 'remove-success'; id: string }
  | { type: 'remove-failure'; id: string };

export type ModelRuntimeSnapshot = {
  modelId: string | null;
  phase: 'idle' | 'loading' | 'loaded' | 'error';
  error?: string;
  backendLabel?: string;
  fallbackReason?: string;
  removing: string[];
};

export const initialModelRuntime: ModelRuntimeSnapshot;
export function canLoadModel(state: ModelRuntimeSnapshot, id: string): boolean;
export function shouldUnloadModel(loadedId: string | null, requestedId?: string): boolean;
export function transitionModelRuntime(state: ModelRuntimeSnapshot, action: ModelRuntimeAction): ModelRuntimeSnapshot;
