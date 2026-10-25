import { router, useLocalSearchParams } from 'expo-router';
import { useState , useEffect } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, ListRow, Screen, SectionTitle, Segmented, Field } from '@/components';
import { getApiKey } from '@/lib/keys';
import { addAndConnect } from '@/lib/mcp-connect';
import { useLibrary, type McpServer } from '@/store/library';
import { fonts, radii, useTheme } from '@/theme';


type Mode = 'url' | 'json';

export default function AddMcp() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const existing = useLibrary((s) => s.servers.find((x) => x.id === id));
  const [mode, setMode] = useState<Mode>('url');
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [auth, setAuth] = useState<McpServer['auth']>(existing?.auth ?? 'none');
  const [token, setToken] = useState('');
  const [json, setJson] = useState('{\n  "mcpServers": {\n    "name": { "url": "https://…/mcp" }\n  }\n}');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (id) getApiKey(`mcp.${id}`).then((k) => k && setToken(k)); }, [id]);

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    try {
      let n = name, u = url;
      if (mode === 'json') {
        const cfg = JSON.parse(json).mcpServers ?? {};
        const [k, v] = Object.entries<{ url?: string }>(cfg)[0] ?? [];
        if (!v?.url) throw new Error('Only HTTP servers with a "url" work on a phone.');
        n = k; u = v.url;
      }
      const r = await addAndConnect({ id, name: n.trim() || 'server', url: u.trim(), auth: token ? 'token' : auth === 'token' ? 'none' : auth, transport: 'http' }, token);
      setStatus({ ok: true, text: `Connected · ${r.tools} tools found` });
      setTimeout(() => router.replace({ pathname: '/mcp-detail', params: { id: r.id } }), 600);
    } catch (e: any) {
      setStatus({ ok: false, text: e.status === 401 ? 'The server wants a sign-in. Add an API token.' : e.message });
    } finally { setBusy(false); }
  };

  return (
    <Screen header={{ title: id ? 'Edit MCP server' : 'Add MCP server' }} footer={<Button label={busy ? 'Connecting…' : id ? 'Save & test' : 'Add server'} flex onPress={submit} disabled={busy} />}>
      <Segmented<Mode> options={[{ value: 'url', label: 'Server URL' }, { value: 'json', label: 'Paste JSON config' }]} value={mode} onChange={setMode} />
      {mode === 'url' ? (
        <>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Server URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="https://home.local:8811/mcp" />
        </>
      ) : (
        <TextInput accessibilityLabel="JSON config" value={json} onChangeText={setJson} multiline autoCapitalize="none" style={{ minHeight: 180, borderRadius: radii.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.text, fontFamily: fonts.mono, fontSize: 13 }} />
      )}
      <View style={{ gap: 8 }}>
        <SectionTitle>Sign-in</SectionTitle>
        <Segmented<'none' | 'token'> options={[{ value: 'none', label: 'None' }, { value: 'token', label: 'API token' }]} value={auth === 'token' || token ? 'token' : 'none'} onChange={setAuth} />
        {(auth === 'token' || token) && <Field label="API token" value={token} onChangeText={setToken} secureTextEntry />}
      </View>
      {status && <Card><ListRow icon={status.ok ? 'check' : 'warn'} danger={!status.ok} label={status.text} last /></Card>}
    </Screen>
  );
}
