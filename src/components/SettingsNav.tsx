import { router, usePathname, type Href } from 'expo-router';
import { Platform, Pressable, ScrollView, View, type PressableStateCallbackType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { useCommands } from '@/store/commands';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type Row = { label: string; path: string; also?: string[] };

/** Settings sections, in the order of the desktop and tablet designs. */
export const SETTINGS_GROUPS: { title: string; rows: Row[] }[] = [
  { title: 'General', rows: [{ label: 'Appearance', path: '/appearance' }, { label: 'Chat defaults', path: '/chat-defaults' }, { label: 'Commands', path: '/commands', also: ['/command-edit'] }] },
  {
    title: 'Models & tools',
    rows: [
      { label: 'Providers & endpoints', path: '/providers', also: ['/provider-detail', '/add-provider'] },
      { label: 'Marketplace', path: '/market' },
      { label: 'Skills', path: '/skills' },
      { label: 'MCP servers & connectors', path: '/mcp' },
      { label: 'Generative UI', path: '/gen-settings' },
    ],
  },
  { title: 'Media & search', rows: [{ label: 'Voice, speech & translation', path: '/audio' }, { label: 'Images', path: '/images' }, { label: 'Web search', path: '/web-search' }, { label: 'Files & documents', path: '/files' }] },
  { title: 'Data', rows: [{ label: 'Sync & backup', path: '/backup' }, { label: 'Privacy & API keys', path: '/privacy' }, { label: 'About', path: '/about' }] },
];

/** Pages that show the settings list beside them on a tablet or computer (the library pages show the app menu). */
export const SETTINGS_PAGES = new Set(['/settings', ...SETTINGS_GROUPS.flatMap((g) => g.rows.filter((r) => !['/market', '/skills', '/mcp'].includes(r.path)).flatMap((r) => [r.path, ...(r.also ?? [])]))]);

const ROW = Platform.OS === 'web' ? 36 : 44;

/** Back to the chat that was open under the settings. */
export function leaveSettings() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

/** The settings sections (260 px on a computer, 232 on a tablet) with what each one is set to. */
export function SettingsNav() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { kind } = useLayout();
  const mode = useSettings((s) => s.mode);
  const providers = useProviders((s) => s.providers.length);
  const { skills, servers } = useLibrary();
  const commands = useCommands((s) => s.items.length);
  const values: Record<string, string> = {
    '/appearance': mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light',
    '/commands': commands ? `${commands} yours` : '',
    '/providers': String(providers),
    '/skills': `${skills.filter((s) => s.enabled).length} on`,
    '/mcp': String(servers.length),
  };
  const bg = (s: PressableStateCallbackType, active: boolean) => (active ? colors.surface2 : (s as { hovered?: boolean }).hovered || s.pressed ? colors.surface : 'transparent');

  return (
    <View accessibilityRole="menu" accessibilityLabel="Settings sections" style={{ width: kind === 'desktop' ? 260 : 232, backgroundColor: colors.bgDeep, borderRightWidth: 1, borderRightColor: colors.hairline }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: 10 }}>
        <Pressable accessibilityRole="button" onPress={leaveSettings} style={(s) => ({ height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: bg(s, false) })}>
          <Icon name="back" size={17} color={colors.text2} />
          <Text size={14} color="text2">Back to chats</Text>
        </Pressable>
        <Text size={22} weight="semi" style={{ marginTop: 10, marginBottom: 12, marginHorizontal: 10 }}>Settings</Text>
        {SETTINGS_GROUPS.map((g) => (
          <View key={g.title} style={{ paddingBottom: 10 }}>
            <Text size={11.5} weight="medium" color="faint" style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }}>{g.title}</Text>
            {g.rows.map((r) => {
              const active = pathname === r.path || !!r.also?.includes(pathname);
              return (
                <Pressable
                  key={r.path}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => (SETTINGS_PAGES.has(pathname) ? router.replace(r.path as Href) : router.push(r.path as Href))}
                  style={(s) => ({ minHeight: ROW, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: bg(s, active) })}>
                  <Text size={14} color={active ? 'text' : 'text2'} style={{ flex: 1 }} numberOfLines={1}>{r.label}</Text>
                  {values[r.path] ? <Text size={12} color="faint">{values[r.path]}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Settings pages on a tablet or computer: the sections on the left, the page on the right. */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { kind } = useLayout();
  if (kind === 'phone') return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <SettingsNav />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}
