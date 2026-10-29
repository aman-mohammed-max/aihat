import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, ListRow, Note, Screen, SectionTitle, Text } from '@/components';
import { isSignedIn, OAuthError, probeAuth, signOut } from '@/api/oauth';
import { useCommandList } from '@/lib/commands';
import { reconnect, removeServer } from '@/lib/mcp-connect';
import { pick } from '@/lib/pick';
import { useLibrary, type McpTool } from '@/store/library';
import { useTheme } from '@/theme';

const KIND = { read: 'Reads', write: 'Writes', delete: 'Deletes' } as const;
const KIND_TONE = { read: 'muted', write: 'warn', delete: 'danger' } as const;
const POLICY = { auto: 'Auto', ask: 'Ask first', off: 'Off' } as const;

/** The small outlined buttons under the server's address. */
function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text size={13}>{label}</Text>
    </Pressable>
  );
}

export default function McpDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const s = useLibrary((x) => x.servers.find((k) => k.id === id));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [signed, setSigned] = useState(false);
  useEffect(() => {
    if (id) isSignedIn(id).then(setSigned);
  }, [id]);
  const commands = useCommandList();
  if (!s) return null;
  const command = commands.find((c) => c.kind === 'mcp' && c.ref === s.id)?.name;

  const refresh = async () => {
    setMsg({ ok: true, text: s.auth === 'oauth' && !signed ? 'Opening your browser to sign in…' : 'Connecting…' });
    const t0 = Date.now();
    try {
      const n = await reconnect(s);
      setMs(Date.now() - t0);
      setSigned(true);
      setMsg({ ok: true, text: `Connected · ${n} tools` });
    } catch (e: any) {
      // A server added without a sign-in that now asks for one: switch it to the browser sign-in when it allows that.
      if (e?.status === 401 && s.auth === 'none' && (await probeAuth(s.url)) === 'oauth') {
        await useLibrary.getState().saveServer({ ...s, auth: 'oauth', connected: false });
        setMsg({ ok: true, text: 'This server needs a sign-in. Tap Sign in to open your browser.' });
        return;
      }
      await useLibrary.getState().saveServer({ ...s, connected: false });
      setSigned(await isSignedIn(id));
      setMs(null);
      setMsg({ ok: false, text: e instanceof OAuthError ? e.message : e.status === 401 ? (s.auth === 'oauth' ? 'Signed out. Sign in again.' : 'This server needs a sign-in. Edit it to add an access token or your own app’s client ID.') : e.message });
    }
  };
  const signOutNow = async () => {
    await signOut(id);
    await useLibrary.getState().saveServer({ ...s, connected: false });
    setSigned(false);
    setMs(null);
    setMsg({ ok: true, text: 'Signed out' });
  };
  const setPolicy = (t: McpTool, policy: McpTool['policy']) =>
    useLibrary.getState().saveServer({ ...s, tools: s.tools.map((x) => (x.name === t.name ? { ...x, policy } : x)) });

  const status = s.connected ? 'Connected' : s.auth === 'none' ? 'Not connected' : 'Sign-in needed';
  const how = s.auth === 'oauth' ? (signed ? 'signed in with your browser' : 'browser sign-in, signed out') : s.auth === 'token' ? 'access token' : 'no sign-in';

  return (
    <Screen
      header={{ title: s.name, sub: s.isConnector ? 'Connector' : 'MCP server' }}
      footer={<Button label="Remove server" variant="danger" flex onPress={async () => { await removeServer(id); router.back(); }} />}>
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.connected ? colors.accent : 'transparent', borderWidth: s.connected ? 0 : 1.5, borderColor: colors.warn }} />
          <Text size={15} weight="medium" style={{ flex: 1 }}>{status}</Text>
          {ms != null && s.connected ? <Text mono size={12} color="muted">{`${ms} ms`}</Text> : null}
        </View>
        <Text mono size={12.5} color="text2" selectable>{s.url}</Text>
        <Text size={12.5} color="muted">{`${s.transport === 'http' ? 'Streamable HTTP' : 'SSE'} · ${how}`}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pill label={s.auth === 'oauth' && !signed ? 'Sign in' : s.connected ? 'Refresh tools' : 'Connect'} onPress={refresh} />
          {s.auth === 'oauth' && signed ? <Pill label="Sign out" onPress={signOutNow} /> : null}
          <Pill label="Edit" onPress={() => router.push({ pathname: '/add-mcp', params: { id } })} />
        </View>
      </View>
      {msg ? <Note color={msg.ok ? 'accent' : 'warn'}>{msg.text}</Note> : null}
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, paddingBottom: 4 }}>
          <SectionTitle space={0}>{`Tools · ${s.tools.length}`}</SectionTitle>
          {s.tools.length ? <Text size={12} color="muted">Tap to change</Text> : null}
        </View>
        {s.tools.length === 0 && <Text size={13.5} color="muted" style={{ paddingHorizontal: 4, paddingVertical: 12 }}>No tools yet. Connect to fetch them.</Text>}
        {s.tools.map((t, i) => (
          <Pressable
            key={t.name}
            accessibilityRole="button"
            accessibilityLabel={`${t.name}, ${KIND[t.kind]}, ${POLICY[t.policy]}`}
            onPress={() => pick(t.name, Object.entries(POLICY).map(([value, label]) => ({ value, label })), t.policy, (v) => setPolicy(t, v as McpTool['policy']))}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 4, paddingVertical: 4, opacity: pressed ? 0.7 : 1, borderBottomWidth: i < s.tools.length - 1 ? 1 : 0, borderBottomColor: colors.hairline })}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text mono size={13.5} numberOfLines={1}>{t.name}</Text>
              <Text size={12} color={KIND_TONE[t.kind]}>{KIND[t.kind]}</Text>
            </View>
            <Text size={13} color={t.policy === 'off' ? 'muted' : 'text2'}>{POLICY[t.policy]}</Text>
          </Pressable>
        ))}
      </View>
      <View>
        <ListRow label="Use in new chats" toggle={{ on: s.enabledByDefault, onChange: (enabledByDefault) => useLibrary.getState().saveServer({ ...s, enabledByDefault }) }} />
        <ListRow label="Command" sub="Turns this server on for a chat, then asks." value={command ? `/${command}` : 'None'} monoValue={!!command} height={52} />
      </View>
    </Screen>
  );
}
