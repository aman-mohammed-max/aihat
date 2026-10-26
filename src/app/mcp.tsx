import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, LinkCard, Note, Screen, SearchBar, SectionTitle, Text, ThingRow } from '@/components';
import { device, isDesktop } from '@/lib/device';
import { useLibrary } from '@/store/library';

const AUTH = { none: '', token: 'token', oauth: 'OAuth' } as const;

export default function Mcp() {
  const allServers = useLibrary((s) => s.servers);
  const servers = useMemo(() => allServers.filter((x) => !x.isConnector), [allServers]);
  const [q, setQ] = useState('');
  const list = servers.filter((s) => `${s.name} ${s.tools.map((t) => t.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const open = (id: string) => router.push({ pathname: '/mcp-detail', params: { id } });
  return (
    <Screen
      header={{ title: 'MCP servers', sub: servers.length ? `${servers.filter((s) => s.connected).length} of ${servers.length} connected` : undefined, right: 'add', addLabel: 'Add MCP server', onAdd: () => router.push('/add-mcp') }}
      gap={0}
      top={
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search servers and tools" hint={q ? `${list.length} results` : undefined} />
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <LinkCard
              items={[
                { icon: 'store', label: 'Browse MCP servers', sub: 'Find hosted servers in the public registry', onPress: () => router.push({ pathname: '/market', params: { tab: 'mcp' } }) },
                { icon: 'link', label: 'Connectors', sub: 'One-tap Google Drive, GitHub, Notion…', onPress: () => router.push('/connectors') },
              ]}
            />
          </View>
        </>
      }
      footer={<Button label="Add MCP server" height={48} flex onPress={() => router.push('/add-mcp')} />}>
      <View style={{ paddingTop: 12 }}>
        <SectionTitle>Your servers</SectionTitle>
        {servers.length === 0 && <Text color="muted" style={{ padding: 4 }}>No servers yet.</Text>}
        {servers.length > 0 && list.length === 0 && <Text color="muted" style={{ padding: 4 }}>No matches.</Text>}
        {list.map((s) =>
          s.connected ? (
            <ThingRow
              key={s.id}
              dot="on"
              name={s.name}
              sub={[s.transport.toUpperCase(), `${s.tools.length} tools`, AUTH[s.auth]].filter(Boolean).join(' · ')}
              padding={13}
              onPress={() => open(s.id)}
              toggle={{ on: s.enabledByDefault, onChange: (enabledByDefault) => useLibrary.getState().saveServer({ ...s, enabledByDefault }) }}
            />
          ) : (
            <ThingRow key={s.id} dot="attention" name={s.name} sub={s.auth === 'none' ? 'Not connected' : 'Sign-in needed'} subTone="warn" padding={13} onPress={() => open(s.id)} action={{ label: 'Connect', onPress: () => open(s.id) }} />
          ),
        )}
        <View style={{ paddingTop: 14 }}>
          <Note>{`Only servers with a web address work here. Servers that run as a program (“stdio” servers) can’t be started ${isDesktop ? 'from AI Hat' : `on a ${device}`}.`}</Note>
        </View>
      </View>
    </Screen>
  );
}
