import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View, type TextInputKeyPressEvent } from 'react-native';

import { Icon, Text, type IconName } from '@/components';
import { openChat, openPage } from '@/components/AppNav';
import { useEscape } from '@/components/Overlays';
import { SETTINGS_GROUPS } from '@/components/SettingsNav';
import { matchCommands, useCommandList } from '@/lib/commands';
import { keyLabel } from '@/lib/layout';
import { useChats } from '@/store/chats';
import { useDraft } from '@/store/draft';
import { fonts, useTheme } from '@/theme';

type Item = { key: string; group: 'Chats' | 'Commands' | 'Go to'; icon?: IconName; slash?: string; label: string; meta?: string; run: () => void };

const PAGES: { label: string; path: string }[] = [
  { label: 'System prompts', path: '/prompts' },
  { label: 'Skills', path: '/skills' },
  { label: 'MCP servers', path: '/mcp' },
  { label: 'Connectors', path: '/connectors' },
  { label: 'Marketplace', path: '/market' },
  { label: 'Mini app', path: '/gen-app' },
  ...SETTINGS_GROUPS.flatMap((g) => g.rows.map((r) => ({ label: `Settings › ${r.label}`, path: r.path }))),
];

const day = (t: number) => {
  const d = new Date(t);
  return d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** ⌘K: search everything (chats, commands, pages and settings) from anywhere on a tablet or computer. */
export default function Palette() {
  const { colors } = useTheme();
  const chats = useChats((s) => s.chats);
  const commands = useCommandList();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const close = () => router.back();
  useEscape(close);

  const query = q.trim().toLowerCase();
  const items: Item[] = [
    ...chats
      .filter((c) => c.title.toLowerCase().includes(query))
      .slice(0, query ? 8 : 5)
      .map((c): Item => ({ key: `c${c.id}`, group: 'Chats', icon: 'chat', label: c.title, meta: day(c.updatedAt), run: () => openChat(`/chat/${c.id}`) })),
    ...(query.startsWith('/') ? matchCommands(query.slice(1), commands) : commands.filter((c) => `${c.name} ${c.summary}`.toLowerCase().includes(query)))
      .slice(0, query ? 6 : 3)
      .map((c): Item => ({
        key: `m${c.name}`,
        group: 'Commands',
        slash: c.name,
        label: c.name,
        meta: c.summary,
        run: () => {
          if (router.canDismiss()) router.dismissAll();
          useDraft.getState().set({ text: `/${c.name} ` });
        },
      })),
    ...PAGES.filter((p) => p.label.toLowerCase().includes(query.replace(/^\//, '')))
      .slice(0, query ? 6 : 3)
      .map((p): Item => ({ key: `p${p.path}`, group: 'Go to', icon: 'layout', label: p.label, run: () => openPage(p.path) })),
  ];
  const active = Math.min(sel, Math.max(items.length - 1, 0));

  const onKey = (e: TextInputKeyPressEvent) => {
    const k = e.nativeEvent.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      setSel(Math.max(0, Math.min(items.length - 1, active + (k === 'ArrowDown' ? 1 : -1))));
    } else if (k === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', paddingTop: '12%', paddingHorizontal: 16 }}>
      <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} />
      <View accessibilityViewIsModal accessibilityLabel="Search everything" style={[{ width: 640, maxWidth: '100%', maxHeight: '76%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, Platform.OS === 'web' ? ({ boxShadow: '0 30px 80px rgba(0,0,0,0.6)' } as object) : { elevation: 24 }]}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.surface2 }}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            autoFocus
            accessibilityLabel="Search"
            value={q}
            onChangeText={(t) => {
              setQ(t);
              setSel(0);
            }}
            onKeyPress={onKey}
            placeholder="Search chats, commands and settings"
            placeholderTextColor={colors.muted}
            style={[{ flex: 1, color: colors.text, fontSize: 16, fontFamily: fonts.ui }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          />
          {Platform.OS === 'web' ? (
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text mono size={11} color="muted">Esc</Text>
            </View>
          ) : null}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 8 }}>
          {items.length === 0 && <Text color="muted" style={{ padding: 12 }}>Nothing matches “{q}”.</Text>}
          {items.map((it, i) => {
            const header = i === 0 || items[i - 1].group !== it.group ? it.group : null;
            return (
              <View key={it.key}>
                {header ? <Text size={11.5} weight="medium" color="muted" style={{ paddingHorizontal: 10, paddingTop: i ? 10 : 4, paddingBottom: 6 }}>{header}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={it.run}
                  onHoverIn={() => setSel(i)}
                  style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: i === active ? colors.surface2 : 'transparent' }}>
                  {it.slash ? <Text mono color="accent" style={{ width: 16 }}>/</Text> : <Icon name={it.icon!} size={16} color={colors.muted} />}
                  <Text size={14} numberOfLines={1} style={{ flexShrink: 1 }}>{it.label}</Text>
                  <Text size={12.5} color="muted" numberOfLines={1} style={{ flex: 1 }}>{it.group === 'Commands' ? it.meta : ''}</Text>
                  {it.group === 'Chats' ? <Text size={12} color="muted">{it.meta}</Text> : null}
                  {i === active && Platform.OS === 'web' ? <Text mono size={11} color="muted">↵</Text> : null}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
        {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.surface2 }}>
            {['↑↓ to move', '↵ to open', '/ for commands', `${keyLabel('K')} anywhere`].map((t) => <Text key={t} size={11.5} color="faint">{t}</Text>)}
          </View>
        ) : null}
      </View>
    </View>
  );
}
