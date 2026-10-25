import { router } from 'expo-router';
import { useState, useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, ListRow, Screen, SearchBar, SectionTitle, Text, Toggle } from '@/components';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme';

export default function Mcp() {
  const { colors } = useTheme();
  const allServers = useLibrary((s) => s.servers);
  const servers = useMemo(() => allServers.filter((x) => !x.isConnector), [allServers]);
  const [q, setQ] = useState('');
  const list = servers.filter((s) => `${s.name} ${s.tools.map((t) => t.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen header={{ title: 'MCP servers' }} footer={<Button label="Add MCP server" flex onPress={() => router.push('/add-mcp')} />}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search servers and tools" />
      <Card>
        <ListRow icon="store" label="Browse MCP servers" sub="Find hosted servers in the public registry" onPress={() => router.push({ pathname: '/market', params: { tab: 'mcp' } })} />
        <ListRow icon="link" label="Connectors" sub="One-tap GitHub, Notion, Drive…" onPress={() => router.push('/connectors')} last />
      </Card>
      <View>
        <SectionTitle>Your servers</SectionTitle>
        {list.length === 0 && <Text color="muted">No servers yet.</Text>}
        <Card>
          {list.map((s, i) => (
            <View key={s.id} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.connected ? '#86EFAC' : '#FDBA74' }} />
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/mcp-detail', params: { id: s.id } })} style={{ flex: 1, paddingVertical: 8 }}>
                <Text weight="medium">{s.name}</Text>
                <Text size={12.5} color="muted">{s.connected ? `${s.transport.toUpperCase()} · ${s.tools.length} tools${s.auth !== 'none' ? ' · ' + s.auth : ''}` : 'Not connected'}</Text>
              </Pressable>
              {s.connected ? <Toggle on={s.enabledByDefault} label={s.name} onChange={(enabledByDefault) => useLibrary.getState().saveServer({ ...s, enabledByDefault })} /> : <Text color="accent" weight="semi">Connect</Text>}
            </View>
          ))}
        </Card>
        <Text size={12.5} color="muted" style={{ marginTop: 10, paddingLeft: 4 }}>Only servers with a web address work here. Servers that run as a program on a computer (“stdio” servers) can’t be started on a phone.</Text>
      </View>
    </Screen>
  );
}
