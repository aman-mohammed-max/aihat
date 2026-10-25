import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, ListRow, Screen, SectionTitle, type IconName } from '@/components';
import { useRefreshModels } from '@/lib/useRefreshModels';

const groups: { title: string; rows: { icon: IconName; label: string; path?: string; refresh?: boolean }[] }[] = [
  { title: 'General', rows: [{ icon: 'sparkle', label: 'Appearance', path: '/appearance' }, { icon: 'sliders', label: 'Chat defaults', path: '/chat-defaults' }] },
  { title: 'Models & tools', rows: [{ icon: 'server', label: 'Providers', path: '/providers' }, { icon: 'store', label: 'Marketplace', path: '/market' }, { icon: 'prompt', label: 'Skills', path: '/skills' }, { icon: 'tool', label: 'MCP servers', path: '/mcp' }, { icon: 'sparkle', label: 'Generative UI', path: '/gen-settings' }, { icon: 'prompt', label: 'Commands', path: '/commands' }, { icon: 'refresh', label: 'Refresh all models', refresh: true }] },
  { title: 'Media & search', rows: [{ icon: 'mic', label: 'Voice & speech', path: '/audio' }, { icon: 'image', label: 'Images', path: '/images' }, { icon: 'globe', label: 'Web search', path: '/web-search' }, { icon: 'file', label: 'Files & documents', path: '/files' }] },
  { title: 'Data', rows: [{ icon: 'refresh', label: 'Sync & backup', path: '/backup' }, { icon: 'lock', label: 'Privacy & API keys', path: '/privacy' }, { icon: 'info', label: 'About', path: '/about' }] },
];

export default function Settings() {
  const refresh = useRefreshModels();
  return (
    <Screen header={{ title: 'Settings' }}>
      {groups.map((g) => (
        <View key={g.title}>
          <SectionTitle>{g.title}</SectionTitle>
          <Card>{g.rows.map((r, i) => <ListRow key={r.label} icon={r.icon} label={r.label} value={r.refresh ? (refresh.busy ? 'Fetching…' : refresh.note || undefined) : undefined} onPress={r.refresh ? refresh.run : () => router.push(r.path as never)} last={i === g.rows.length - 1} />)}</Card>
        </View>
      ))}
    </Screen>
  );
}
