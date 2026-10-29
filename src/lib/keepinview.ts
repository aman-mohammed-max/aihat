import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';

/**
 * Keeps the highlighted row of a list in view when the arrow keys move past its edge. Spread `scroll` onto the
 * ScrollView and give each row (or the view around it) `onLayout={row(index)}`.
 */
export function useKeepInView(active: number) {
  const ref = useRef<ScrollViewInstance>(null);
  const rows = useRef<Record<number, { y: number; h: number }>>({});
  const view = useRef({ y: 0, h: 0 });

  useEffect(() => {
    const r = rows.current[active];
    const { y, h } = view.current;
    if (!r || !h) return;
    if (r.y < y) ref.current?.scrollTo({ y: Math.max(0, r.y - 4), animated: false });
    else if (r.y + r.h > y + h) ref.current?.scrollTo({ y: r.y + r.h - h + 4, animated: false });
  }, [active]);

  return {
    scroll: {
      ref,
      scrollEventThrottle: 32,
      onLayout: (e: LayoutChangeEvent) => { view.current.h = e.nativeEvent.layout.height; },
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => { view.current.y = e.nativeEvent.contentOffset.y; },
    },
    row: (i: number) => (e: LayoutChangeEvent) => { rows.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }; },
  };
}
