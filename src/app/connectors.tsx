import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, RowButton, Screen, SearchBar, SectionTitle, Text } from '@/components';
import { CONNECTORS } from '@/lib/mcp-connect';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme';

type Connector = (typeof CONNECTORS)[number];

export default function Connectors() {
  const { colors } = useTheme();
  const servers = useLibrary((s) => s.servers);
  const [q, setQ] = useState('');
  const match = (c: Connector) => servers.find((s) => s.isConnector && s.name === c.name);
  const list = CONNECTORS.filter((c) => `${c.name} ${c.sub}`.toLowerCase().includes(q.toLowerCase()));
  const on = list.filter((c) => match(c)?.connected);
  const off = list.filter((c) => !match(c)?.connected);
  const connect = (c: Connector) => router.push({ pathname: '/connector-auth', params: { key: c.key } });

  const row = (c: Connector, divider: boolean) => {
    const s = match(c);
    const connected = !!s?.connected;
    return (
      <Pressable
        key={c.key}
        accessibilityRole="button"
        accessibilityLabel={`${c.name}. ${c.sub}. ${connected ? 'Connected' : 'Not connected'}`}
        onPress={() => (connected && s ? router.push({ pathname: '/mcp-detail', params: { id: s.id } }) : connect(c))}
        style={({ pressed }) => ({ minHeight: 58, paddingHorizontal: 4, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1, borderBottomWidth: divider ? 1 : 0, borderBottomColor: colors.hairline })}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Text size={14} weight="semi">{c.letter}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text size={15}>{c.name}</Text>
          <Text size={12.5} color="muted">{c.sub}</Text>
        </View>
        {connected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : <RowButton label="Connect" onPress={() => connect(c)} />}
      </Pressable>
    );
  };

  return (
    <Screen
      header={{ title: 'Connectors', sub: `${CONNECTORS.filter((c) => match(c)?.connected).length} connected` }}
      gap={0}
      top={
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search connectors" hint={q ? `${list.length} results` : undefined} />
          </View>
          <Text size={13} color="muted" style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6, lineHeight: 19 }}>
            Ready-made MCP servers for apps you use. Sign in once; choose per chat when they’re on.
          </Text>
        </>
      }
      footer={<Button label="Add a custom MCP server" variant="outline" flex onPress={() => router.push('/add-mcp')} />}>
      {list.length === 0 && <Text color="muted" style={{ padding: 4, paddingTop: 10 }}>No matches.</Text>}
      {on.length > 0 && (
        <View style={{ paddingTop: 10 }}>
          <SectionTitle>Connected</SectionTitle>
          {on.map((c) => row(c, true))}
        </View>
      )}
      {off.length > 0 && (
        <View style={{ paddingTop: on.length ? 16 : 10 }}>
          <SectionTitle>Available</SectionTitle>
          {off.map((c, i) => row(c, i < off.length - 1))}
        </View>
      )}
    </Screen>
  );
}
