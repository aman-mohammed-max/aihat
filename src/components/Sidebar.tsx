import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatMenu } from '@/lib/menus';
import { useChats, type Chat } from '@/store/chats';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme';

import { ContextMenuArea, NATIVE_MENU } from './ContextMenuArea';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

const DAY = 86_400_000;

/** Chats in the menu's groups: pinned first, then by when you last used them. */
export function groupChats(chats: Chat[]) {
  const today = new Date().setHours(0, 0, 0, 0);
  const g: Record<string, Chat[]> = { Pinned: [], Today: [], 'Previous 7 days': [], Older: [], Archived: [] };
  for (const c of chats) {
    if (c.archived) g.Archived.push(c);
    else if (c.pinned) g.Pinned.push(c);
    else if (c.updatedAt >= today) g.Today.push(c);
    else if (c.updatedAt >= today - 7 * DAY) g['Previous 7 days'].push(c);
    else g.Older.push(c);
  }
  return Object.entries(g).filter(([, v]) => v.length);
}

export function Sidebar({ navigation }: DrawerContentComponentProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const chats = useChats((s) => s.chats);
  const { prompts, skills, servers } = useLibrary();
  const groups = useMemo(() => groupChats(chats), [chats]);

  const go = (path: string) => {
    navigation.closeDrawer();
    router.push(path as never);
  };
  const lib: { icon: IconName; label: string; count: string; path: string }[] = [
    { icon: 'prompt', label: 'System prompts', count: String(prompts.length), path: '/prompts' },
    { icon: 'sparkle', label: 'Skills', count: String(skills.length), path: '/skills' },
    { icon: 'server', label: 'MCP servers', count: String(servers.filter((s) => !s.isConnector).length), path: '/mcp' },
    { icon: 'link', label: 'Connectors', count: String(servers.filter((s) => s.isConnector).length), path: '/connectors' },
    { icon: 'sparkle', label: 'Mini app', count: 'App', path: '/gen-app' },
  ];

  return (
    <View accessibilityLabel="Main menu" style={{ flex: 1, backgroundColor: colors.bgDeep, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => go('/search-chats')} style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }}>
          <Icon name="search" size={17} color={colors.muted} />
          <Text color="muted">Search chats</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={() => { navigation.closeDrawer(); router.replace('/'); }} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="edit" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 6 }}>
        {lib.map((l) => (
          <Pressable key={l.label} accessibilityRole="button" onPress={() => go(l.path)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 }}>
            <Icon name={l.icon} size={19} color={colors.text2} />
            <Text style={{ flex: 1 }}>{l.label}</Text>
            <Text size={13} color="muted">{l.count}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 6, paddingTop: 12 }}>
        {groups.length === 0 && <Text color="muted" size={13} style={{ padding: 12 }}>No chats yet.</Text>}
        {groups.map(([title, list]) => (
          <View key={title}>
            <Text size={12} weight="medium" color="muted" style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 }}>{title}</Text>
            {list.map((c) => (
              <ContextMenuArea key={c.id} menu={() => chatMenu(c.id)}>
              <Pressable
                accessibilityRole="button"
                onPress={() => go(`/chat/${c.id}`)}
                onLongPress={NATIVE_MENU ? undefined : () => router.push({ pathname: '/chat-menu', params: { chatId: c.id } })}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
                <Text numberOfLines={1}>{c.title}</Text>
              </Pressable>
              </ContextMenuArea>
            ))}
          </View>
        ))}
      </ScrollView>

      <Pressable accessibilityRole="button" onPress={() => go('/settings')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingBottom: insets.bottom + 14, borderTopWidth: 1, borderTopColor: colors.hairline }}>
        <Icon name="settings" size={19} color={colors.text2} />
        <Text style={{ flex: 1 }}>Settings</Text>
        <Icon name="chevronRight" size={16} color={colors.faint} />
      </Pressable>
    </View>
  );
}
