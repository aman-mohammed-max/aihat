import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, GestureStateManager, MouseButton, PointerType, useTapGesture, type TapGestureEvent } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import type { Menu } from '@/lib/menus';

import { openContextMenu } from './ContextMenu';

export type ContextMenuAreaProps = { menu: () => Menu; children: ReactNode; style?: StyleProp<ViewStyle> };

/** Whether the system draws the menu, and so also opens it on a long press (iPad only). */
export const NATIVE_MENU = false;

const MOUSE = PointerType.MOUSE;

/**
 * Android: a right-click with a mouse or a two-finger click on a touchpad (tablets, Chromebooks) opens the app's menu
 * where the pointer is. React Native doesn't report mouse buttons on Android, so Gesture Handler listens for the right
 * button; it treats a finger like a left button, so fingers are turned away the moment they land and taps, buttons and
 * scrolling inside work as before.
 */
export function ContextMenuArea({ menu, children, style }: ContextMenuAreaProps) {
  const latest = useRef(menu);
  useEffect(() => {
    latest.current = menu;
  });
  const config = useMemo(() => {
    const open = (x: number, y: number) => openContextMenu(latest.current(), { x, y });
    return {
      mouseButton: MouseButton.RIGHT,
      manualActivation: true,
      onBegin: (e: TapGestureEvent) => {
        'worklet';
        // Activating at once (before the button is released) also cancels the press underneath, so a right-click on
        // a chat doesn't open it as well.
        if (e.pointerType === MOUSE) GestureStateManager.activate(e.handlerTag);
        else GestureStateManager.fail(e.handlerTag);
      },
      onActivate: (e: TapGestureEvent) => {
        'worklet';
        scheduleOnRN(open, e.absoluteX, e.absoluteY);
      },
    };
  }, []);
  const gesture = useTapGesture(config);
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={style}>{children}</View>
    </GestureDetector>
  );
}
