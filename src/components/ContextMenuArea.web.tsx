import * as Clipboard from 'expo-clipboard';
import type { MouseEvent } from 'react';
import { View } from 'react-native';

import { keyLabel } from '@/lib/layout';
import type { Menu } from '@/lib/menus';
import { toast } from '@/store/toast';

import { openContextMenu } from './ContextMenu';
import type { ContextMenuAreaProps } from './ContextMenuArea';

export const NATIVE_MENU = false;

/**
 * Computers: right-click, a two-finger click or the menu key opens the app's menu at the pointer instead of the
 * browser's. With text selected inside, it starts with Copy selection. Text fields keep the browser's menu (paste,
 * spelling).
 */
export function ContextMenuArea({ menu, children, style }: ContextMenuAreaProps) {
  const onContextMenu = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget;
    const selection = window.getSelection();
    const picked = selection && !selection.isCollapsed && selection.anchorNode && box.contains(selection.anchorNode) ? selection.toString() : '';
    const rows: Menu = picked
      ? [{ label: 'Copy selection', icon: 'copy', sf: 'doc.on.doc', hint: keyLabel('C'), onPress: async () => { await Clipboard.setStringAsync(picked); toast('Copied'); } }, null, ...menu()]
      : menu();
    // The menu key and Shift+F10 have no pointer position: open at the item's corner instead.
    const rect = box.getBoundingClientRect();
    const fromKeyboard = e.clientX === 0 && e.clientY === 0;
    openContextMenu(rows, fromKeyboard ? { x: rect.left + 16, y: rect.top + 16 } : { x: e.clientX, y: e.clientY });
  };
  return <View style={style} {...({ onContextMenu } as object)}>{children}</View>;
}
