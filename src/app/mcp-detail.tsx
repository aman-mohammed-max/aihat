import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ListRow, Screen, SectionTitle, Text } from '@/components';
import { connect, listTools } from '@/api/mcp';
import { deleteApiKey } from '@/lib/keys';
import { pick } from '@/lib/pick';
import { useLibrary, type McpTool } from '@/store/library';

const KIND = { read: 'Reads', write: 'Writes', delete: 'Deletes' } as const;
const POLICY = { auto: 'Auto', ask: 'Ask first', off: 'Off' } as const;

export default function McpDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLibrary((x) => x.servers.find((k) => k.id === id));
  const [msg, setMsg] = useState('');
  if (!s) return null;

  const refresh = async () => {
    setMsg('Connecting…');
    try {
      await connect({ url: s.url, id });
      const tools = await listTools({ url: s.url, id }, s.tools);
      await useLibrary.getState().saveServer({ ...s, tools, connected: true });
      setMsg(`Connected · ${tools.length} tools`);
    } catch (e: any) {
      await useLibrary.getState().saveServer({ ...s, connected: false });
      setMsg(e.status === 401 ? 'Sign-in needed' : e.message);
    }
  };
  const setPolicy = (t: McpTool, policy: McpTool['policy']) =>
    useLibrary.getState().saveServer({ ...s, tools: s.tools.map((x) => (x.name === t.name ? { ...x, policy } : x)) });

  return (
    <Screen header={{ title: s.name }} footer={<Button label="Remove server" variant="danger" flex onPress={async () => { await deleteApiKey(`mcp.${id}`); await useLibrary.getState().deleteServer(id); router.back(); }} />}>
      <Card style={{ padding: 14, gap: 4 }}>
        <Text weight="medium" color={s.connected ? 'accent' : 'warn'}>{s.connected ? 'Connected' : 'Not connected'}</Text>
        <Text mono size={12.5} color="muted" selectable>{s.url}</Text>
        <Text size={12.5} color="muted">{s.transport === 'http' ? 'Streamable HTTP' : 'SSE'}{s.auth !== 'none' ? ` · ${s.auth}` : ''}</Text>
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 10 }}>
          <Button label={s.connected ? 'Refresh tools' : 'Connect'} height={40} variant="outline" onPress={refresh} />
          <Button label="Edit" height={40} variant="outline" onPress={() => router.push({ pathname: '/add-mcp', params: { id } })} />
        </View>
      </Card>
      {msg ? <Text color="text2">{msg}</Text> : null}
      <View>
        <SectionTitle>{`Tools · ${s.tools.length}`}</SectionTitle>
        <Card>
          {s.tools.length === 0 && <ListRow label="No tools yet" last />}
          {s.tools.map((t, i) => (
            <ListRow key={t.name} mono label={t.name} sub={KIND[t.kind]} value={POLICY[t.policy]} onPress={() => pick(t.name, Object.entries(POLICY).map(([value, label]) => ({ value, label })), t.policy, (v) => setPolicy(t, v as McpTool['policy']))} last={i === s.tools.length - 1} />
          ))}
        </Card>
      </View>
      <Card><ListRow label="Use in new chats" toggle={{ on: s.enabledByDefault, onChange: (enabledByDefault) => useLibrary.getState().saveServer({ ...s, enabledByDefault }) }} last /></Card>
    </Screen>
  );
}
