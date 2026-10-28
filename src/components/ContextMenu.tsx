import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Easing, Platform, Pressable, View } from 'react-native';
import { create } from 'zustand';

import { tidy, type Menu, type MenuItem } from '@/lib/menus';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type Open = { id: number; menu: Menu; x: number; y: number };

const useContextMenu = create<{ open: Open | null }>(() => ({ open: null }));
let next = 1;

/** Show the app's right-click menu with its corner at a point in the window. */
export function openContextMenu(menu: Menu, at: { x: number; y: number }) {
  const rows = tidy(menu);
  if (!rows.some(Boolean)) return;
  useContextMenu.setState({ open: { id: next++, menu: rows, x: at.x, y: at.y } });
}

const close = () => useContextMenu.setState({ open: null });

/** Draws the open right-click menu above everything; mount once, at the root. */
export function ContextMenuHost() {
  const open = useContextMenu((s) => s.open);
  return open ? <MenuCard key={open.id} {...open} /> : null;
}

const MOUSE = Platform.OS === 'web';
const ROW = MOUSE ? 34 : 42;
const WIDTH = 248;
const EDGE = 8;

type Size = { width: number; height: number };

function MenuCard({ menu, x, y }: Open) {
  const { colors, isDark } = useTheme();
  const [area, setArea] = useState<Size | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [active, setActive] = useState(-1);
  const [shown] = useState(() => new Animated.Value(0));
  const rows = menu.flatMap((m, i) => (m ? [i] : []));
  const latest = useRef({ active, rows, menu });
  useEffect(() => {
    latest.current = { active, rows, menu };
  });

  // Opens to the right and down from the pointer, and flips when that would leave the window.
  const flipX = !!area && !!size && x + size.width + EDGE > area.width;
  const flipY = !!area && !!size && y + size.height + EDGE > area.height;
  const placed = area && size
    ? {
        left: Math.max(EDGE, Math.min(flipX ? x - size.width : x, area.width - size.width - EDGE)),
        top: Math.max(EDGE, Math.min(flipY ? y - size.height : y, area.height - size.height - EDGE)),
      }
    : null;

  const ready = placed !== null;
  useEffect(() => {
    if (ready) Animated.timing(shown, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [ready, shown]);

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    if (Platform.OS !== 'web') return () => back.remove();
    // Keyboard: arrows move, Enter or Space chooses, Esc closes. Resizing or leaving the window closes it too.
    const onKey = (e: KeyboardEvent) => {
      const { active: a, rows: r, menu: m } = latest.current;
      const at = r.indexOf(a);
      if (e.key === 'Escape' || e.key === 'Tab') close();
      else if (e.key === 'ArrowDown') setActive(r[(at + 1) % r.length]);
      else if (e.key === 'ArrowUp') setActive(r[at <= 0 ? r.length - 1 : at - 1]);
      else if (e.key === 'Home') setActive(r[0]);
      else if (e.key === 'End') setActive(r[r.length - 1]);
      else if ((e.key === 'Enter' || e.key === ' ') && a >= 0) choose(m[a] as MenuItem);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      back.remove();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, []);

  const backdropWeb = Platform.OS === 'web' ? ({ onContextMenu: (e: { preventDefault: () => void }) => { e.preventDefault(); close(); } } as object) : null;

  return (
    <View
      onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, elevation: 2000 }}>
      <Pressable accessibilityLabel="Close menu" onPress={close} {...backdropWeb} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <Animated.View
        accessibilityRole="menu"
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        style={{
          position: 'absolute',
          left: placed?.left ?? x,
          top: placed?.top ?? y,
          width: WIDTH,
          padding: 5,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? colors.surface : colors.bg,
          boxShadow: isDark ? '0px 16px 40px rgba(0,0,0,0.55)' : '0px 12px 32px rgba(0,0,0,0.16)',
          opacity: shown,
          transformOrigin: `${flipX ? 'right' : 'left'} ${flipY ? 'bottom' : 'top'}`,
          transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        }}>
        {menu.map((m, i) =>
          m ? (
            <Pressable
              key={`${i}-${m.label}`}
              accessibilityRole="menuitem"
              accessibilityLabel={m.label}
              onPress={() => choose(m)}
              onHoverIn={() => setActive(i)}
              onHoverOut={() => setActive((a) => (a === i ? -1 : a))}
              style={({ pressed }) => ({
                height: ROW,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 10,
                borderRadius: 9,
                backgroundColor: pressed || active === i ? (m.danger ? colors.dangerSoft : colors.surface2) : 'transparent',
              })}>
              <Icon name={m.icon} size={16} color={m.danger ? colors.danger : colors.muted} />
              <Text size={14} color={m.danger ? 'danger' : 'text'} numberOfLines={1} style={{ flex: 1 }}>{m.label}</Text>
              {m.hint ? <Text mono size={11.5} color="faint">{m.hint}</Text> : null}
            </Pressable>
          ) : (
            <View key={`divider-${i}`} style={{ height: 1, backgroundColor: colors.hairline, marginVertical: 4, marginHorizontal: 8 }} />
          ),
        )}
      </Animated.View>
    </View>
  );
}

function choose(item: MenuItem) {
  close();
  runMenuItem(item);
}

/** Runs a menu row; if it fails, says why in the app's dialog. */
export function runMenuItem(item: MenuItem) {
  const failed = (e: unknown) => Alert.alert('That didn’t work', e instanceof Error ? e.message : String(e));
  try {
    Promise.resolve(item.onPress()).catch(failed);
  } catch (e) {
    failed(e);
  }
}
