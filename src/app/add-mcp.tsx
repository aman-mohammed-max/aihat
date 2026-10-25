import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { OAuthError } from '@/api/oauth';
import { Button, Card, ListRow, Screen, SectionTitle, Segmented, Field, Text } from '@/components';
import { getApiKey } from '@/lib/keys';
import { addAndConnect, removeServer } from '@/lib/mcp-connect';
import { useLibrary, type McpServer } from '@/store/library';
import { fonts, radii, useTheme } from '@/theme';

type Mode = 'url' | 'json';
type Auth = McpServer['auth'];

/**
 * The first server in a pasted `mcpServers` config (the format Claude Desktop and most READMEs use). Only servers with a web
 * address work on a phone; a server that is a program to start ("command") gets a plain explanation instead.
 */
function readConfig(text: string): { name?: string; url: string } {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('That isn’t valid JSON. Paste the server’s "mcpServers" block, or one server’s settings.');
  }
  const table = json.mcpServers ?? json.servers ?? json.mcp?.servers;
  const entries: [string | undefined, any][] = table && typeof table === 'object' ? Object.entries(table) : json.url || json.command ? [[undefined, json]] : Object.entries(json);
  for (const [name, v] of entries) if (typeof v?.url === 'string') return { name, url: v.url };
  if (entries.some(([, v]) => typeof v?.command === 'string')) {
    throw new Error('This server is a program that has to run on a computer (it has a "command"). A phone can’t start it. Look for a hosted version with a web address.');
  }
  throw new Error('No server address ("url") found in that config.');
}

export default function AddMcp() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, body } = useTheme();
  const existing = useLibrary((s) => s.servers.find((x) => x.id === id));
  const [mode, setMode] = useState<Mode>('url');
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [auth, setAuth] = useState<Auth>(existing?.auth ?? 'none');
  const [token, setToken] = useState('');
  const [json, setJson] = useState('{\n  "mcpServers": {\n    "name": { "url": "https://…/mcp" }\n  }\n}');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) getApiKey(`mcp.${id}`).then((k) => k && (setToken(k), setAuth('token')));
  }, [id]);

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    try {
      let n = name, u = url;
      if (mode === 'json') {
        const cfg = readConfig(json);
        n = cfg.name ?? n;
        u = cfg.url;
      }
      const r = await addAndConnect(
        { id, name: n.trim() || 'server', url: u.trim(), auth: auth === 'token' && !token ? 'none' : auth, transport: 'http' },
        auth === 'oauth' ? undefined : auth === 'token' ? token : '',
      );
      setStatus({ ok: true, text: `Connected · ${r.tools} tools found` });
      setTimeout(() => router.replace({ pathname: '/mcp-detail', params: { id: r.id } }), 600);
    } catch (e: any) {
      // A brand-new server that never connected isn't kept (an edited one stays so you can fix it).
      if (!id && e?.serverId) await removeServer(e.serverId).catch(() => {});
      setStatus({
        ok: false,
        text:
          e instanceof OAuthError
            ? e.message
            : e?.status === 401
              ? auth === 'oauth'
                ? 'The server turned the sign-in down.'
                : 'The server wants a sign-in. Choose “Browser sign-in”, or add an access token.'
              : e?.message ?? 'Could not connect.',
      });
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? (auth === 'oauth' ? 'Waiting for sign-in…' : 'Connecting…') : id ? 'Save & test' : auth === 'oauth' ? 'Sign in and add' : 'Add server';

  return (
    <Screen header={{ title: id ? 'Edit MCP server' : 'Add MCP server' }} footer={<Button label={label} flex onPress={submit} disabled={busy} />}>
      {!id && <Segmented<Mode> options={[{ value: 'url', label: 'Server URL' }, { value: 'json', label: 'Paste config' }]} value={mode} onChange={(m) => { setMode(m); setStatus(null); }} />}

      {mode === 'url' ? (
        <>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Server URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="https://mcp.example.com/mcp" />
        </>
      ) : (
        <View style={{ gap: 8 }}>
          <TextInput
            accessibilityLabel="Server config"
            value={json}
            onChangeText={setJson}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={{ minHeight: 180, borderRadius: radii.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.text, fontFamily: fonts.mono, fontSize: body - 1.5 }}
          />
          <Text size={12.5} color="muted">Paste what a server’s README shows. Servers with a web address (“url”) work; ones that are a program to start (“command”) need a computer and can’t run on a phone.</Text>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SectionTitle>Sign-in</SectionTitle>
        <Segmented<Auth> options={[{ value: 'none', label: 'None' }, { value: 'token', label: 'Access token' }, { value: 'oauth', label: 'Browser sign-in' }]} value={auth} onChange={setAuth} />
        {auth === 'token' && <Field label="Access token" value={token} onChangeText={setToken} secureTextEntry hint="Sent as “Authorization: Bearer …”. Stored only in this phone’s secure keystore." />}
        {auth === 'oauth' && <Text size={12.5} color="muted" style={{ lineHeight: 18 }}>Your browser opens so you can sign in to the service. AI Hat registers itself with the service automatically. Works with servers that allow it (Notion, Linear, Sentry, Vercel, Stripe and many more); others need an access token.</Text>}
      </View>
      {status && <Card><ListRow icon={status.ok ? 'check' : 'warn'} danger={!status.ok} label={status.text} last /></Card>}
    </Screen>
  );
}
