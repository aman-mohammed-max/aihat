import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useHoverGesture } from 'react-native-gesture-handler';

import { matchCommands, splitCommand, findCommand, useCommandList, type Command } from '@/lib/commands';
import * as haptic from '@/lib/haptics';
import { useKeepInView } from '@/lib/keepinview';
import { navKey, type NavKey } from '@/lib/palettenav';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type Tab = 'all' | 'commands' | 'skills' | 'mcp';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'commands', label: 'Commands' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
];
const inTab = (c: Command, t: Tab) => t === 'all' || (t === 'skills' ? c.kind === 'skill' : t === 'mcp' ? c.kind === 'mcp' : !c.kind);

/** Rows shown at most, and how long a mouse is ignored after the keyboard moved the highlight (see `hover`). */
const MAX_ROWS = 60;
const HOVER_QUIET_MS = 300;

type Nav = { q: string | null; tab: Tab; index: number; dismissed: boolean; keyboard: boolean };
const CLOSED: Nav = { q: null, tab: 'all', index: 0, dismissed: false, keyboard: false };

type Actions = {
  /** Put text in the chat box (used to complete "/ima" into "/image "). */
  onInsert: (text: string) => void;
  /** Run a command that needs no extra text straight away. */
  onRun: (text: string) => void;
};

/**
 * The command list's state, kept by the chat screen so the chat box can steer it: while `/ima` is being typed, the arrow
 * keys move a highlight, Enter uses it, Tab completes it and Esc closes the list.
 */
export function usePalette(text: string, { onInsert, onRun }: Actions) {
  const list = useCommandList();
  const query = /^\/(\?|[a-z0-9_-]*)$/i.exec(text)?.[1] ?? null;
  const matches = useMemo(() => (query === null ? [] : matchCommands(query, list)), [query, list]);
  const [nav, setNav] = useState<Nav>(CLOSED);
  const lastKey = useRef(0);

  // A new query starts at the top again; closing the list resets its filter too.
  let cur = nav;
  if (nav.q !== query) {
    cur = { q: query, tab: query === null || nav.q === null ? 'all' : nav.tab, index: 0, dismissed: false, keyboard: nav.keyboard && query !== null };
    setNav(cur);
  }

  const count = (t: Tab) => matches.filter((c) => inTab(c, t)).length;
  // Filter chips only appear once there is a skill or MCP server to filter for.
  const showTabs = count('skills') + count('mcp') > 0;
  const tab = showTabs ? cur.tab : 'all';
  const shown = useMemo(() => matches.filter((c) => inTab(c, tab)).slice(0, MAX_ROWS), [matches, tab]);
  const open = query !== null && !cur.dismissed && matches.length > 0;
  const active = Math.min(cur.index, shown.length - 1);

  const choose = (c: Command) => {
    haptic.select();
    if (c.needsArgs) onInsert(`/${c.name} `);
    else onRun(`/${c.name}`);
  };

  return {
    list,
    query,
    open,
    shown,
    active,
    tab,
    showTabs,
    count,
    /** Show which row is highlighted: always on computers, on Android and iPad once a mouse or keyboard has been used. */
    marked: Platform.OS === 'web' || cur.keyboard,
    setTab: (t: Tab) => setNav({ ...cur, tab: t, index: 0 }),
    choose,
    /** A mouse moving over a row highlights it, unless the keyboard just did (scrolling slides rows under a resting mouse). */
    hover: (i: number) => {
      if (Date.now() - lastKey.current > HOVER_QUIET_MS) setNav({ ...cur, index: i, keyboard: true });
    },
    /** A row got keyboard focus (Android and iPad move it with the arrow keys themselves). */
    focus: (i: number) => setNav({ ...cur, index: i, keyboard: true }),
    /** For the chat box's key presses. Returns true when the list used the key, so the box must not. */
    onKey: (e: NavKey): boolean => {
      if (!open) return false;
      const r = navKey(e, active, shown.length);
      if (!r) return false;
      lastKey.current = Date.now();
      if (r.do === 'move') setNav({ ...cur, index: r.to, keyboard: true });
      else if (r.do === 'close') setNav({ ...cur, dismissed: true });
      else if (r.do === 'complete') onInsert(`/${shown[active].name} `);
      else choose(shown[active]);
      return true;
    },
  };
}

export type Palette = ReturnType<typeof usePalette>;

/**
 * Appears above the chat box while a slash command is being typed: a filtered list of commands,
 * then (once the name is complete) a one-line hint with the command's current settings.
 */
export function CommandPalette({ text, palette }: { text: string; palette: Palette }) {
  const { colors } = useTheme();

  // Name complete and followed by a space: show what the command will do.
  const parsed = palette.query === null ? splitCommand(text) : null;
  const active: Command | undefined = parsed && /\s/.test(text) ? findCommand(parsed.name, palette.list) : undefined;

  if (active) {
    const hint = active.hint?.();
    if (!hint && !active.args) return null;
    return (
      <View style={{ marginHorizontal: 12, marginBottom: 6, borderRadius: 14, backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 4, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text size={12.5} color="muted" style={{ flex: 1 }} numberOfLines={2}>
          <Text size={12.5} mono color="accent">/{active.name}</Text> {hint ?? active.summary}
        </Text>
        {active.options ? (
          <Pressable accessibilityRole="button" onPress={() => { haptic.select(); active.options!(); }} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}>
            <Text size={13} color="accent" weight="medium">Options</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return palette.open ? <PaletteList palette={palette} /> : null;
}

/** The list itself. */
function PaletteList({ palette }: { palette: Palette }) {
  const { colors } = useTheme();
  const { shown, tab, showTabs, count } = palette;
  const inView = useKeepInView(palette.active);

  return (
    <View style={{ marginHorizontal: 12, marginBottom: 6, borderRadius: 16, backgroundColor: colors.surface, maxHeight: 320, overflow: 'hidden' }}>
      {showTabs && (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2 }}>
          {TABS.filter((t) => t.id === 'all' || count(t.id) > 0).map((t) => {
            const on = tab === t.id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => { haptic.select(); palette.setTab(t.id); }}
                hitSlop={{ top: 6, bottom: 6 }}
                style={(s) => ({ height: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: on ? colors.accentSoft : (s as { hovered?: boolean }).hovered ? colors.selected : colors.surface2 })}>
                <Text size={12.5} weight={on ? 'medium' : 'regular'} color={on ? 'accent' : 'muted'}>{t.label} {count(t.id)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <ScrollView {...inView.scroll} keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingVertical: 4 }}>
        {shown.length === 0 && <Text size={13} color="muted" style={{ padding: 14 }}>Nothing here matches.</Text>}
        {shown.map((c, i) => <PaletteRow key={c.name} c={c} i={i} palette={palette} onLayout={inView.row(i)} />)}
      </ScrollView>
      {Platform.OS === 'web' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 14, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {['↑↓ to move', '↵ to use', 'Tab to complete', 'Esc to close'].map((t) => <Text key={t} size={11.5} color="faint">{t}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One row. It lights up under a mouse: on computers through the browser's hover, on Android through Gesture Handler,
 * because React Native doesn't report hovering there.
 */
function PaletteRow({ c, i, palette, onLayout }: { c: Command; i: number; palette: Palette; onLayout: (e: LayoutChangeEvent) => void }) {
  const { colors } = useTheme();
  const on = palette.marked && i === palette.active;
  const hover = useHoverGesture({ enabled: Platform.OS === 'android', runOnJS: true, cancelsJSResponder: false, onActivate: () => palette.hover(i) });
  return (
    <GestureDetector gesture={hover}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`/${c.name}${c.kind ? `, ${c.kind === 'mcp' ? 'MCP server' : 'skill'}` : ''}. ${c.summary}`}
        onPress={() => palette.choose(c)}
        onHoverIn={() => palette.hover(i)}
        onFocus={() => palette.focus(i)}
        onLayout={onLayout}
        style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed || on ? colors.surface2 : 'transparent' })}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text mono size={14} numberOfLines={1}>
            <Text mono size={14} color="accent">/{c.name}</Text>
            {c.args ? <Text mono size={12} color="faint">  {c.args}</Text> : null}
          </Text>
          <Text size={12.5} color="muted" numberOfLines={2}>{c.summary}</Text>
        </View>
        {c.kind ? (
          <View style={{ height: 22, borderRadius: 11, paddingHorizontal: 8, justifyContent: 'center', backgroundColor: colors.surface2 }}>
            <Text size={11} color="muted">{c.kind === 'mcp' ? 'MCP' : 'Skill'}</Text>
          </View>
        ) : null}
        {c.custom ? <Icon name="edit" size={13} color={colors.faint} /> : null}
        {on && Platform.OS === 'web' ? <Text mono size={11} color="faint">↵</Text> : null}
      </Pressable>
    </GestureDetector>
  );
}
