/**
 * Right-click opens the same menu as a long press: with a mouse or a trackpad (two-finger click) on Android tablets,
 * iPads, Chromebooks and the desktop app. Spread the result onto the View or Pressable that has the menu.
 */
export function contextMenu(open: () => void) {
  return {
    onPointerDown: (e: { nativeEvent: { button?: number } }) => {
      if (e.nativeEvent.button === 2) open();
    },
  };
}
