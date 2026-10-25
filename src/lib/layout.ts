import { Platform, useWindowDimensions } from 'react-native';
import { create } from 'zustand';

import { useSettings } from '@/store/settings';

export type LayoutKind = 'phone' | 'tablet' | 'desktop';

/**
 * The design's breakpoints, by window width (a foldable or a resized desktop window follows the same rules):
 * phone under 700 px, tablet 700–1099 (icon rail), desktop 1100 and up (side menu); a side panel fits from 1280.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const kind: LayoutKind = width >= 1100 ? 'desktop' : width >= 700 ? 'tablet' : 'phone';
  return { kind, width, height, wide: kind !== 'phone', panel: width >= 1280 };
}

export const RAIL = 64;
export const SIDEBAR = 272;
/** Chats and pages keep a readable line length on big screens. */
export const COLUMN = 760;

/** How wide the app's side menu is right now: 0 on a phone (it's a drawer), the rail, or the full menu. */
export function useNavWidth() {
  const { kind } = useLayout();
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  return kind === 'phone' ? 0 : kind === 'desktop' && !collapsed ? SIDEBAR : RAIL;
}

/** The menu that slides over the content from the icon rail (tablet, or a folded desktop menu). */
export const useMenu = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

/** Keyboard hints only make sense with a keyboard: the desktop app. */
export const showKeys = Platform.OS === 'web';
const mac = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
/** `⌘N` on a Mac, `Ctrl+N` elsewhere. */
export const keyLabel = (k: string) => (mac ? `⌘${k}` : `Ctrl+${k}`);
