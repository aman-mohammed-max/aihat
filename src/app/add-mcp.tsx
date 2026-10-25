import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { OAuthError } from '@/api/oauth';
import { Button, Card, ListRow, Screen, SectionTitle, Segmented, Field, Text } from '@/components';
import { bridgeCommand, bridgeUrl, commandLine, newKey, parseServerConfig } from '@/lib/bridge';
import * as haptic from '@/lib/haptics';
import { getApiKey } from '@/lib/keys';
import { addAndConnect, removeServer } from '@/lib/mcp-connect';
import { useLibrary, type McpServer } from '@/store/library';
import { toast } from '@/store/toast';
import { fonts, radii, useTheme } from '@/theme';

type Mode = 'url' | 'json' | 'computer';
type Auth = McpServer['auth'];

const mono = (colors: ReturnType<typeof useTheme>['colors'], body: number) => ({
  borderRadius: radii.input,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  padding: 12,
  color: colors.text,
  fontFamily: fonts.mono,
  fontSize: body - 1.5,
});

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
  // A server that runs on a computer: its command, settings, and the address of the bridge.
  const [cmd, setCmd] = useState('');
  const [envText, setEnvText] = useState('');
  const [address, setAddress] = useState('');
  const [key] = useState(() => newKey((n) => Crypto.getRandomBytes(n)));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) getApiKey(`mcp.${id}`).then((k) => k && (setToken(k), setAuth('token')));
  }, [id]);

  // What to run on the computer, from the command and settings typed (or pasted from the server's README).
  const parsed = cmd.trim() ? parseServerConfig(cmd) : null;
  const env: Record<string, string> = { ...(parsed?.spec?.env ?? {}) };
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  const bridge = parsed?.spec ? bridgeCommand({ ...parsed.spec, env }, { key }) : '';

  const fail = (e: any) => {
    const text =
      e instanceof OAuthError
        ? e.message
        : e?.status === 401
          ? auth === 'oauth'
            ? 'The server turned the sign-in down.'
            : 'The server wants a sign-in. Choose “Browser sign-in”, or add an access token.'
          : e?.message ?? 'Could not connect.';
    setStatus({ ok: false, text });
  };

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    let created: string | undefined;
    try {
      if (mode === 'computer') {
        if (!bridge) throw new Error('Type or paste the command that starts the server.');
        const target = bridgeUrl(address);
        if (!target) throw new Error('Type your computer’s address first.');
        const r = await addAndConnect({ name: name.trim() || parsed?.name || 'my computer', url: target, auth: 'token', transport: 'http' }, key);
        created = r.id;
        haptic.success();
        setStatus({ ok: true, text: `Connected · ${r.tools} tools found. Keep the command running on your computer.` });
        setTimeout(() => router.replace({ pathname: '/mcp-detail', params: { id: r.id } }), 900);
        return;
      }

      let n = name, u = url;
      if (mode === 'json') {
        const cfg = parseServerConfig(json);
        if (!cfg) throw new Error('Couldn’t read that. Paste the server’s "mcpServers" block, or one server’s settings.');
        if (cfg.spec) {
          // A program for a computer: continue in the "On my computer" tab with it filled in.
          setCmd(commandLine(cfg.spec));
          setEnvText(Object.entries(cfg.spec.env).map(([k, v]) => `${k}=${v}`).join('\n'));
          setName(cfg.name ?? name);
          setMode('computer');
          setStatus({ ok: true, text: 'This server runs as a program on a computer. Run the command below there, then add its address.' });
          return;
        }
        n = cfg.name ?? n;
        u = cfg.url!;
      }
      const r = await addAndConnect(
        { id, name: n.trim() || 'server', url: u.trim(), auth: auth === 'token' && !token ? 'none' : auth, transport: 'http' },
        auth === 'oauth' ? undefined : auth === 'token' ? token : '',
      );
      created = r.id;
      setStatus({ ok: true, text: `Connected · ${r.tools} tools found` });
      setTimeout(() => router.replace({ pathname: '/mcp-detail', params: { id: r.id } }), 600);
    } catch (e: any) {
      // A brand-new server that never connected isn't kept (an edited one stays so you can fix it).
      if (!id && e?.serverId && !created) await removeServer(e.serverId).catch(() => {});
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? (auth === 'oauth' && mode !== 'computer' ? 'Waiting for sign-in…' : 'Connecting…') : id ? 'Save & test' : mode === 'json' ? 'Read config' : auth === 'oauth' && mode === 'url' ? 'Sign in and add' : 'Add server';

  return (
    <Screen header={{ title: id ? 'Edit MCP server' : 'Add MCP server' }} footer={<Button label={label} flex onPress={submit} disabled={busy} />}>
      {!id && <Segmented<Mode> options={[{ value: 'url', label: 'Server URL' }, { value: 'json', label: 'Paste config' }, { value: 'computer', label: 'On my computer' }]} value={mode} onChange={(m) => { setMode(m); setStatus(null); }} />}

      {mode === 'url' && (
        <>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Server URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="https://mcp.example.com/mcp" />
        </>
      )}

      {mode === 'json' && (
        <View style={{ gap: 8 }}>
          <TextInput accessibilityLabel="Server config" value={json} onChangeText={setJson} multiline autoCapitalize="none" autoCorrect={false} style={[mono(colors, body), { minHeight: 180 }]} />
          <Text size={12.5} color="muted">Paste what a server’s README shows: an address (“url”), or a program (“command” and “args”). Programs are set up in “On my computer”.</Text>
        </View>
      )}

      {mode === 'computer' && (
        <>
          <Text size={13} color="text2" style={{ lineHeight: 19 }}>
            Many MCP servers are programs for a computer (they start with “npx …”, “uvx …” or “docker run …”). A phone can’t start them, so you run one on your computer behind a small bridge (supergateway, needs Node.js), and AI Hat connects to it over your network.
          </Text>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Files on my laptop" />
          <View style={{ gap: 6 }}>
            <Text size={12.5} weight="medium" color="muted">Command that starts the server</Text>
            <TextInput accessibilityLabel="Command that starts the server" value={cmd} onChangeText={setCmd} multiline autoCapitalize="none" autoCorrect={false} placeholder="npx -y @modelcontextprotocol/server-filesystem ~/Documents" placeholderTextColor={colors.faint} style={[mono(colors, body), { minHeight: 76 }]} />
            {cmd.trim() && !parsed?.spec ? <Text size={12.5} color="warn">That doesn’t look like a command. Paste the line that starts the server, or its JSON config.</Text> : null}
          </View>
          <View style={{ gap: 6 }}>
            <Text size={12.5} weight="medium" color="muted">Settings it needs (optional, one NAME=value per line)</Text>
            <TextInput accessibilityLabel="Settings" value={envText} onChangeText={setEnvText} multiline autoCapitalize="none" autoCorrect={false} placeholder="API_KEY=…" placeholderTextColor={colors.faint} style={[mono(colors, body), { minHeight: 64 }]} />
          </View>
          {bridge ? (
            <View style={{ gap: 8 }}>
              <SectionTitle>1. Run this on your computer</SectionTitle>
              <Card style={{ padding: 14, gap: 12 }}>
                <Text mono size={12} color="text2" selectable>{bridge}</Text>
                <Button label="Copy command" variant="outline" height={40} onPress={async () => { await Clipboard.setStringAsync(bridge); haptic.success(); toast('Command copied'); }} />
              </Card>
              <Text size={12.5} color="muted" style={{ lineHeight: 18 }}>Leave it running while you use the server (stop it with Ctrl+C). For macOS, Linux, or Windows through WSL or Git Bash. The key is made just for this server; anyone on your network who has it could use the server, so keep it private.</Text>
              <SectionTitle>2. Tell AI Hat where it is</SectionTitle>
              <Field label="Your computer’s address" value={address} onChangeText={setAddress} keyboardType="url" placeholder="192.168.1.20" hint="Same Wi-Fi as the phone. Find it with: ipconfig getifaddr en0 (Mac), hostname -I (Linux) or ipconfig (Windows)." />
              {address.trim() ? <Text mono size={12} color="muted">{bridgeUrl(address)}</Text> : null}
            </View>
          ) : null}
        </>
      )}

      {mode !== 'computer' && (
        <View style={{ gap: 8 }}>
          <SectionTitle>Sign-in</SectionTitle>
          <Segmented<Auth> options={[{ value: 'none', label: 'None' }, { value: 'token', label: 'Access token' }, { value: 'oauth', label: 'Browser sign-in' }]} value={auth} onChange={setAuth} />
          {auth === 'token' && <Field label="Access token" value={token} onChangeText={setToken} secureTextEntry hint="Sent as “Authorization: Bearer …”. Stored only in this phone’s secure keystore." />}
          {auth === 'oauth' && <Text size={12.5} color="muted" style={{ lineHeight: 18 }}>Your browser opens so you can sign in to the service. AI Hat registers itself with the service automatically. Works with servers that allow it (Notion, Linear, Sentry, Vercel, Stripe and many more); others need an access token.</Text>}
        </View>
      )}
      {status && <Card><ListRow icon={status.ok ? 'check' : 'warn'} danger={!status.ok} label={status.text} last /></Card>}
    </Screen>
  );
}
