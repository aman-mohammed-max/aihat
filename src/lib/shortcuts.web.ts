import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';

import { openChat, openSearch, openSettings } from '@/components/AppNav';
import { SETTINGS_PAGES } from '@/components/SettingsNav';
import { useSettings } from '@/store/settings';

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Desktop app: ⌘N / Ctrl+N new chat, ⌘K search everything, ⌘, settings, ⌘B fold the side menu. The macOS menu bar
 * sends the same actions as `aihat:command` events (its shortcuts reach the menu before the page).
 */
export function useDesktopShortcuts() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  });

  useEffect(() => {
    const wide = width >= 700;
    const run = (action: string) => {
      const here = where.current;
      if (action === 'new-chat') openChat('/');
      else if (action === 'search') {
        if (here === '/palette') router.back();
        else openSearch(wide);
      } else if (action === 'settings') {
        if (!SETTINGS_PAGES.has(here)) openSettings();
      } else if (action === 'toggle-sidebar') useSettings.getState().set({ sidebarCollapsed: !useSettings.getState().sidebarCollapsed });
      else if (action === 'about') router.push('/about');
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(mac ? e.metaKey : e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const action = k === 'n' && !e.shiftKey ? 'new-chat' : k === 'k' ? 'search' : k === ',' ? 'settings' : k === 'b' ? 'toggle-sidebar' : null;
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      run(action);
    };
    const onCommand = (e: Event) => run(String((e as CustomEvent).detail));
    // Capture phase: text fields stop key events from bubbling up.
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('aihat:command', onCommand);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('aihat:command', onCommand);
    };
  }, [width]);
}
