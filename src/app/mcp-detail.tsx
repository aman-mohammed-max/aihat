import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ListRow, Screen, SectionTitle, Text } from '@/components';
import { isSignedIn, OAuthError, signOut } from '@/api/oauth';
import { reconnect, removeServer } from '@/lib/mcp-connect';
import { useCommandList } from '@/lib/commands';
import { pick } from '@/lib/pick';
import { useLibrary, type McpTool } from '@/store/library';

const KIND = { read: 'Reads', write: 'Writes', delete: 'Deletes' } as const;
const POLICY = { auto: 'Auto', ask: 'Ask first', off: 'Off' } as const;

export default function McpDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLibrary((x) => x.servers.find((k) => k.id === id));
  const [msg, setMsg] = useState('');
  const [signed, setSigned] = useState(false);
  useEffect(() => {
    if (id) isSignedIn(id).then(setSigned);
  }, [id]);
  const commands = useCommandList();
  if (!s) return null;
  const command = commands.find((c) => c.kind === 'mcp' && c.ref === s.id)?.name;

  const refresh = async () => {
    setMsg(s.auth === 'oauth' && !signed ? 'Opening your browser to sign in…' : 'Connecting…');
    try {
      const n = await reconnect(s);
      setSigned(true);
      setMsg(`Connected · ${n} tools`);
    } catch (e: any) {
      await useLibrary.getState().saveServer({ ...s, connected: false });
      setSigned(await isSignedIn(id));
      setMsg(e instanceof OAuthError ? e.message : e.status === 401 ? (s.auth === 'oauth' ? 'Signed out. Sign in again.' : 'Sign-in needed') : e.message);
    }
  };
  const signOutNow = async () => {
    await signOut(id);
    await useLibrary.getState().saveServer({ ...s, connected: false });
    setSigned(false);
    setMsg('Signed out');
  };
  const setPolicy = (t: McpTool, policy: McpTool['policy']) =>
    useLibrary.getState().saveServer({ ...s, tools: s.tools.map((x) => (x.name === t.name ? { ...x, policy } : x)) });

  return (
    <Screen header={{ title: s.name }} footer={<Button label="Remove server" variant="danger" flex onPress={async () => { await removeServer(id); router.back(); }} />}>
      <Card style={{ padding: 14, gap: 4 }}>
        <Text weight="medium" color={s.connected ? 'accent' : 'warn'}>{s.connected ? 'Connected' : 'Not connected'}</Text>
        <Text mono size={12.5} color="muted" selectable>{s.url}</Text>
        <Text size={12.5} color="muted">{s.transport === 'http' ? 'Streamable HTTP' : 'SSE'} · {s.auth === 'oauth' ? (signed ? 'Signed in with your browser' : 'Browser sign-in, signed out') : s.auth === 'token' ? 'Access token' : 'No sign-in'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10 }}>
          <Button label={s.auth === 'oauth' && !signed ? 'Sign in' : s.connected ? 'Refresh tools' : 'Connect'} height={40} variant="outline" onPress={refresh} />
          {s.auth === 'oauth' && signed ? <Button label="Sign out" height={40} variant="outline" onPress={signOutNow} /> : null}
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
      <Card>
        <ListRow label="Use in new chats" toggle={{ on: s.enabledByDefault, onChange: (enabledByDefault) => useLibrary.getState().saveServer({ ...s, enabledByDefault }) }} />
        <ListRow label="Command" sub="Turns this server on for a chat, then asks." value={command ? `/${command}` : ''} last />
      </Card>
    </Screen>
  );
}
