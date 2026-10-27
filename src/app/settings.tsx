import Constants from 'expo-constants';
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { Card, ListRow, Screen, SectionTitle, type IconName } from '@/components';
import { device } from '@/lib/device';
import { useLayout } from '@/lib/layout';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useCommands } from '@/store/commands';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { useSettings, type Settings as S } from '@/store/settings';

type Row = { icon: IconName; label: string; path?: string; refresh?: boolean; value?: string };

const IMAGE: Record<S['imageEngine'], string> = { provider: 'My endpoint', comfyui: 'ComfyUI', a1111: 'AUTOMATIC1111' };
const SEARCH: Record<S['searchEngine'], string> = { provider: 'My endpoint', searxng: 'SearXNG', brave: 'Brave', tavily: 'Tavily' };
const BACKUP: Record<S['backupTarget'], string> = { drive: 'Drive', icloud: 'iCloud', file: 'File' };

export default function Settings() {
  const refresh = useRefreshModels();
  const { wide } = useLayout();
  const s = useSettings();
  const providers = useProviders((x) => x.providers.length);
  const models = useProviders((x) => x.models.length);
  const { skills, servers } = useLibrary();
  const commands = useCommands((x) => x.items.length);
  // A tablet or computer shows the sections beside each page, so open the first one.
  if (wide) return <Redirect href="/appearance" />;

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'General',
      rows: [
        { icon: 'contrast', label: 'Appearance', path: '/appearance', value: s.mode === 'system' ? 'System' : s.mode === 'dark' ? 'Dark' : 'Light' },
        { icon: 'chat', label: 'Chat defaults', path: '/chat-defaults', value: s.defaultModelId ?? undefined },
        { icon: 'sparkle', label: 'Memory', path: '/memory', value: s.memoryEnabled ? `${s.memoryItems.length} saved` : 'Off' },
      ],
    },
    {
      title: 'Models & tools',
      rows: [
        { icon: 'stack', label: 'Providers & endpoints', path: '/providers', value: String(providers) },
        { icon: 'store', label: 'Marketplace', path: '/market', value: 'Skills & MCP' },
        { icon: 'star', label: 'Skills', path: '/skills', value: `${skills.filter((k) => k.enabled).length} on` },
        { icon: 'plug', label: 'MCP servers & connectors', path: '/mcp', value: String(servers.length) },
        { icon: 'grid', label: 'Generative UI', path: '/gen-settings', value: s.genUi ? 'On' : 'Off' },
        { icon: 'slashes', label: 'Commands', path: '/commands', value: commands ? `${commands} yours` : undefined },
        { icon: 'refresh', label: 'Refresh all models', refresh: true, value: refresh.busy ? 'Fetching…' : refresh.note || `${models} models` },
      ],
    },
    {
      title: 'Media & search',
      rows: [
        { icon: 'mic', label: 'Voice, speech & translation', path: '/audio', value: s.dictationEngine === 'phone' ? `This ${device}` : 'My endpoint' },
        { icon: 'image', label: 'Images', path: '/images', value: IMAGE[s.imageEngine] },
        { icon: 'globe', label: 'Web search', path: '/web-search', value: SEARCH[s.searchEngine] },
        { icon: 'file', label: 'Files & documents', path: '/files' },
      ],
    },
    {
      title: 'Data',
      rows: [
        { icon: 'cloud', label: 'Sync & backup', path: '/backup', value: BACKUP[s.backupTarget] },
        { icon: 'lock', label: 'Privacy & API keys', path: '/privacy' },
        { icon: 'info', label: 'About', path: '/about', value: `v${Constants.expoConfig?.version ?? '0.1.0'}` },
      ],
    },
  ];

  return (
    <Screen header={{ title: 'Settings' }} gap={12}>
      {groups.map((g) => (
        <View key={g.title}>
          <SectionTitle>{g.title}</SectionTitle>
          <Card>
            {g.rows.map((r) => (
              <ListRow key={r.label} icon={r.icon} label={r.label} value={r.value} height={42} chevron={!r.refresh} onPress={r.refresh ? refresh.run : () => router.push(r.path as never)} />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
