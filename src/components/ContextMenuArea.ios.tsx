import { Button, ContextMenu, Divider, Host, RNHostView } from '@expo/ui/swift-ui';
import { Platform, View } from 'react-native';

import { tidy } from '@/lib/menus';
import { useTheme } from '@/theme';

import { runMenuItem } from './ContextMenu';
import type { ContextMenuAreaProps } from './ContextMenuArea';

/**
 * iPad: the system's own menu, which opens on a right-click or two-finger click with a mouse or trackpad, and on a
 * long press. React Native never sees right-clicks on iOS, so the menu has to come from the system. iPhone is
 * unchanged: messages use their ⋯ button and chats a long press.
 */
export const NATIVE_MENU = Platform.OS === 'ios' && Platform.isPad;

export function ContextMenuArea({ menu, children, style }: ContextMenuAreaProps) {
  const { isDark } = useTheme();
  if (!NATIVE_MENU) return <View style={style}>{children}</View>;
  const rows = tidy(menu());
  return (
    <Host matchContents={{ vertical: true }} colorScheme={isDark ? 'dark' : 'light'} style={style}>
      <ContextMenu>
        <ContextMenu.Items>
          {rows.map((m, i) =>
            m ? (
              <Button key={`${i}-${m.label}`} label={m.label} systemImage={m.sf} role={m.danger ? 'destructive' : undefined} onPress={() => runMenuItem(m)} />
            ) : (
              <Divider key={`divider-${i}`} />
            ),
          )}
        </ContextMenu.Items>
        <ContextMenu.Trigger>
          {/* Width from the row it sits in, height from its content, so text wraps and grows as a reply streams. */}
          <RNHostView matchContents={{ vertical: true }}>
            <View>{children}</View>
          </RNHostView>
        </ContextMenu.Trigger>
      </ContextMenu>
    </Host>
  );
}
