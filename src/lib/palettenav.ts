/** The parts of a key press the command list cares about (a browser key event has all of them). */
export type NavKey = { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; isComposing?: boolean; keyCode?: number };

export type NavResult =
  | { do: 'move'; to: number }
  /** Enter: use the highlighted command (runs it, or puts `/name ` in the box when it needs text). */
  | { do: 'run' }
  /** Tab: put `/name ` in the box so arguments can follow. */
  | { do: 'complete' }
  | { do: 'close' };

const PAGE = 6;

/** What a key does to the command list. null means the key isn't for the list and goes to the chat box as usual. */
export function navKey(e: NavKey, active: number, count: number): NavResult | null {
  // An input method that is still composing (Japanese, Chinese, Korean…) uses these keys itself.
  if (count <= 0 || e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey || e.altKey) return null;
  const wrap = (i: number) => (i + count) % count;
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  switch (e.key) {
    case 'ArrowDown': return { do: 'move', to: wrap(active + 1) };
    case 'ArrowUp': return { do: 'move', to: wrap(active - 1) };
    case 'PageDown': return { do: 'move', to: clamp(active + PAGE) };
    case 'PageUp': return { do: 'move', to: clamp(active - PAGE) };
    case 'Enter': return e.shiftKey ? null : { do: 'run' };
    case 'Tab': return e.shiftKey ? null : { do: 'complete' };
    case 'Escape': return { do: 'close' };
    default: return null;
  }
}
