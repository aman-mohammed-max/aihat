export const initialModelRuntime = {
  modelId: null,
  phase: 'idle',
  error: undefined,
  removing: [],
};

export const canLoadModel = (state, id) => !state.removing.includes(id);
export const shouldUnloadModel = (loadedId, requestedId) => requestedId === undefined || loadedId === requestedId;

export function transitionModelRuntime(state, action) {
  switch (action.type) {
    case 'load-start':
      if (state.removing.includes(action.id)) return state;
      return { ...state, modelId: action.id, phase: 'loading', error: undefined };
    case 'load-success':
      return state.modelId === action.id && !state.removing.includes(action.id)
        ? { ...state, phase: 'loaded', error: undefined }
        : state;
    case 'load-failure':
      return state.modelId === action.id && !state.removing.includes(action.id)
        ? { ...state, phase: 'error', error: action.error }
        : state;
    case 'unloaded':
      return state.modelId === action.id
        ? { ...state, modelId: null, phase: 'idle', error: undefined }
        : state;
    case 'remove-start':
      return {
        ...state,
        modelId: state.modelId === action.id ? null : state.modelId,
        phase: state.modelId === action.id ? 'idle' : state.phase,
        error: state.modelId === action.id ? undefined : state.error,
        removing: state.removing.includes(action.id) ? state.removing : [...state.removing, action.id],
      };
    case 'remove-success':
      return {
        ...state,
        modelId: state.modelId === action.id ? null : state.modelId,
        phase: state.modelId === action.id ? 'idle' : state.phase,
        error: state.modelId === action.id ? undefined : state.error,
        removing: state.removing.filter((id) => id !== action.id),
      };
    case 'remove-failure':
      return { ...state, removing: state.removing.filter((id) => id !== action.id) };
    default:
      return state;
  }
}
