import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Screen, SearchBar, SectionTitle, Text } from '@/components';
import { CONNECTORS } from '@/lib/mcp-connect';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme';

export default function Connectors() {
  const { colors } = useTheme();
  const servers = useLibrary((s) => s.servers);
  const [q, setQ] = useState('');
  const match = (c: (typeof CONNECTORS)[number]) => servers.find((s) => s.isConnector && s.name === c.name);
  const list = CONNECTORS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const row = ({ c, last }: { c: (typeof CONNECTORS)[number]; last: boolean }) => {
    const s = match(c);
    return (
      <Pressable accessibilityRole="button" onPress={() => (s?.connected ? router.push({ pathname: '/mcp-detail', params: { id: s.id } }) : router.push({ pathname: '/connector-auth', params: { key: c.key } }))} style={{ minHeight: 64, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.hairline }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}><Text weight="semi">{c.name[0]}</Text></View>
        <View style={{ flex: 1 }}><Text weight="medium">{c.name}</Text><Text size={12.5} color="muted">{c.sub}</Text></View>
        {s?.connected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#86EFAC' }} /> : <Text color="accent" weight="semi">Connect</Text>}
      </Pressable>
    );
  };
  const on = list.filter((c) => match(c)?.connected), off = list.filter((c) => !match(c)?.connected);
  return (
    <Screen header={{ title: 'Connectors' }} footer={<Button label="Add a custom MCP server" variant="outline" flex onPress={() => router.push('/add-mcp')} />}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search connectors" />
      <Text size={13} color="muted">Ready-made MCP servers for apps you use. Sign in once; choose per chat when they’re on.</Text>
      {on.length > 0 && <View><SectionTitle>Connected</SectionTitle><Card>{on.map((c, i) => <View key={c.key}>{row({ c, last: i === on.length - 1 })}</View>)}</Card></View>}
      <View><SectionTitle>Available</SectionTitle><Card>{off.map((c, i) => <View key={c.key}>{row({ c, last: i === off.length - 1 })}</View>)}</Card></View>
    </Screen>
  );
}
