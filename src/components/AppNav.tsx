import { router, usePathname, type Href } from 'expo-router';
import { Platform, Pressable, ScrollView, View, type PressableStateCallbackType, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { contextMenu } from '@/lib/contextMenu';
import { keyLabel, RAIL, showKeys, SIDEBAR, useLayout, useMenu } from '@/lib/layout';
import { useChats } from '@/store/chats';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { groupChats } from './Sidebar';
import { Text } from './Text';

/** Rows are mouse-sized in the desktop app and finger-sized on a tablet. */
const ROW = Platform.OS === 'web' ? 38 : 44;

/** Background for a nav row: highlighted when it's the current page, tinted on hover (desktop). */
function rowBg(state: PressableStateCallbackType, active: boolean, colors: ReturnType<typeof useTheme>['colors']) {
  if (active) return colors.surface2;
  return (state as { hovered?: boolean }).hovered || state.pressed ? colors.surface : 'transparent';
}

const LIBRARY: { icon: IconName; label: string; path: string; count?: 'prompts' | 'skills' | 'servers' | 'connectors'; badge?: string }[] = [
  { icon: 'prompt', label: 'System prompts', path: '/prompts', count: 'prompts' },
  { icon: 'star', label: 'Skills', path: '/skills', count: 'skills' },
  { icon: 'plug', label: 'MCP servers', path: '/mcp', count: 'servers' },
  { icon: 'link', label: 'Connectors', path: '/connectors', count: 'connectors' },
  { icon: 'shop', label: 'Marketplace', path: '/market' },
  { icon: 'grid', label: 'Mini app', path: '/gen-app', badge: 'App' },
];

/** Leave whatever page is open and go to a chat or a fresh one. */
export function openChat(path: '/' | `/chat/${string}`) {
  if (router.canDismiss()) router.dismissAll();
  if (path === '/') router.replace('/');
  else router.navigate(path as Href);
}

/** A library page: on top of the chat, or in place of the page that is open (so Back still goes to the chat). */
export function openPage(path: string) {
  if (router.canDismiss()) router.replace(path as Href);
  else router.push(path as Href);
}

/** ⌘K: everything (chats, commands, pages) on a computer or tablet; the chat search on a phone. */
export const openSearch = (wide: boolean) => router.push(wide ? '/palette' : '/search-chats');
export const openSettings = () => router.push('/settings');

function Kbd({ k }: { k: string }) {
  if (!showKeys) return null;
  return <Text mono size={11} color="muted">{keyLabel(k)}</Text>;
}

/** The full side menu (272 px): new chat, search, your library, chat history, settings. */
export function AppSidebar({ onCollapse, onNavigate }: { onCollapse?: () => void; onNavigate?: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { wide } = useLayout();
  const chats = useChats((s) => s.chats);
  const { prompts, skills, servers } = useLibrary();
  const groups = groupChats(chats);
  const counts = { prompts: prompts.length, skills: skills.length, servers: servers.filter((s) => !s.isConnector).length, connectors: servers.filter((s) => s.isConnector).length };
  const go = (fn: () => void) => () => {
    onNavigate?.();
    fn();
  };

  return (
    <View accessibilityRole="menu" accessibilityLabel="Chats and library" style={{ width: SIDEBAR, backgroundColor: colors.bgDeep, borderRightWidth: 1, borderRightColor: colors.hairline, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 8, paddingHorizontal: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 4, paddingBottom: 12 }}>
        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="logo" size={17} color={colors.onAccent} strokeWidth={2} />
        </View>
        <Text size={15} weight="semi" style={{ flex: 1 }}>AI Hat</Text>
        {onCollapse ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Collapse sidebar" onPress={onCollapse} style={(s) => ({ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: rowBg(s, false, colors) })}>
            <Icon name="sidebar" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={go(() => openChat('/'))} style={(s) => ({ height: ROW + 2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: rowBg(s, false, colors) })}>
        <Icon name="edit" size={17} color={colors.text} />
        <Text size={14} style={{ flex: 1 }}>New chat</Text>
        <Kbd k="N" />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={go(() => openSearch(wide))} style={(s) => ({ height: ROW, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: rowBg(s, false, colors) })}>
        <Icon name="search" size={17} color={colors.text2} />
        <Text size={14} color="text2" style={{ flex: 1 }}>Search</Text>
        <Kbd k="K" />
      </Pressable>

      <View style={{ paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
        {LIBRARY.map((l) => {
          const active = pathname === l.path || pathname.startsWith(`${l.path}-`);
          return (
            <Pressable key={l.path} accessibilityRole="button" onPress={go(() => openPage(l.path))} style={(s) => ({ height: ROW - 2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: rowBg(s, active, colors) })}>
              <Icon name={l.icon} size={17} color={active ? colors.text : colors.muted} />
              <Text size={14} color={active ? 'text' : 'text2'} style={{ flex: 1 }}>{l.label}</Text>
              {l.count ? <Text size={12} color="faint">{counts[l.count]}</Text> : null}
              {l.badge ? (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 5, paddingHorizontal: 5 }}>
                  <Text size={10.5} color="muted">{l.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 10, paddingBottom: 8 }}>
        {groups.length === 0 && <Text size={13} color="muted" style={{ padding: 10 }}>No chats yet.</Text>}
        {groups.map(([title, list]) => (
          <View key={title} style={{ paddingBottom: 6 }}>
            <Text size={11.5} weight="medium" color="faint" style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }}>{title}</Text>
            {list.map((c) => {
              const active = pathname === `/chat/${c.id}`;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  onPress={go(() => openChat(`/chat/${c.id}`))}
                  onLongPress={() => router.push({ pathname: '/chat-menu', params: { chatId: c.id } })}
                  {...contextMenu(() => router.push({ pathname: '/chat-menu', params: { chatId: c.id } }))}
                  style={(s) => ({ minHeight: ROW - 4, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10, backgroundColor: rowBg(s, active, colors) })}>
                  <Text size={13.5} color={active ? 'text' : 'text2'} numberOfLines={1}>{c.title}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Pressable accessibilityRole="button" onPress={go(openSettings)} style={(s) => ({ height: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 10, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: rowBg(s, false, colors) })}>
        <Icon name="settings" size={17} color={colors.text2} />
        <Text size={14} color="text2" style={{ flex: 1 }}>Settings</Text>
        <Kbd k="," />
      </Pressable>
    </View>
  );
}

function RailButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={(s) => ({ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: rowBg(s, !!active, colors) })}>
      <Icon name={icon} size={19} color={active ? colors.text : colors.text2} />
    </Pressable>
  );
}

/** The 64 px icon rail: the menu folded down (tablet, or a folded desktop menu). */
export function AppRail({ onExpand }: { onExpand: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { wide } = useLayout();
  return (
    <View accessibilityRole="menu" accessibilityLabel="Chats and library" style={{ width: RAIL, backgroundColor: colors.bgDeep, borderRightWidth: 1, borderRightColor: colors.hairline, alignItems: 'center', gap: 4, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>
      <RailButton icon="sidebar" label="Open sidebar" onPress={onExpand} />
      <RailButton icon="edit" label="New chat" onPress={() => openChat('/')} />
      <RailButton icon="search" label="Search" onPress={() => openSearch(wide)} />
      <View style={{ width: 28, height: 1, backgroundColor: colors.hairline, marginVertical: 6 }} />
      {LIBRARY.slice(0, 5).map((l) => (
        <RailButton key={l.path} icon={l.icon} label={l.label} active={pathname === l.path || pathname.startsWith(`${l.path}-`)} onPress={() => openPage(l.path)} />
      ))}
      <View style={{ flex: 1 }} />
      <RailButton icon="settings" label="Settings" onPress={openSettings} />
    </View>
  );
}

const shadow: ViewStyle = Platform.select({
  web: { boxShadow: '12px 0 40px rgba(0,0,0,0.5)' } as ViewStyle,
  default: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 12, height: 0 }, elevation: 16 },
})!;

/**
 * The app's frame on a tablet or computer: the side menu (or its icon rail) on the left, the page on the right.
 * On a phone it adds nothing; the menu is a drawer there.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { kind } = useLayout();
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  const menu = useMenu();
  const pathname = usePathname();
  // The first-run screen stands alone.
  if (kind === 'phone' || pathname === '/welcome') return <>{children}</>;
  const full = kind === 'desktop' && !collapsed;
  const expand = () => (kind === 'desktop' ? useSettings.getState().set({ sidebarCollapsed: false }) : menu.set(!menu.open));
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {full ? <AppSidebar onCollapse={() => useSettings.getState().set({ sidebarCollapsed: true })} /> : <AppRail onExpand={expand} />}
      <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>{children}</View>
      {!full && menu.open ? (
        <>
          <Pressable accessibilityLabel="Close menu" onPress={() => menu.set(false)} style={{ position: 'absolute', top: 0, bottom: 0, left: RAIL, right: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          <View style={[{ position: 'absolute', top: 0, bottom: 0, left: RAIL, width: SIDEBAR, flexDirection: 'row' }, shadow]}>
            <AppSidebar onNavigate={() => menu.set(false)} />
          </View>
        </>
      ) : null}
    </View>
  );
}
