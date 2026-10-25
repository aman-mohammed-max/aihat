import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { OAuthError, probeAuth } from '@/api/oauth';
import { Button, Card, Chip, Field, Icon, ListRow, Screen, SectionTitle, Text } from '@/components';
import { bridgeCommand, bridgeUrl, newKey } from '@/lib/bridge';
import * as haptic from '@/lib/haptics';
import { addAndConnect, removeServer } from '@/lib/mcp-connect';
import { buildMcpConnection, computerPlan, planMcp, recallMcp, type McpListing } from '@/lib/market';
import { slugify } from '@/lib/skills';
import { useLibrary } from '@/store/library';
import { toast } from '@/store/toast';
import { useTheme } from '@/theme';

type Outcome = { ok: true; id: string; tools: number } | { ok: false; text: string };
type Kind = 'none' | 'oauth' | 'token' | 'unknown';

const hint = (text: string) => <Text size={12.5} color="muted" style={{ lineHeight: 18 }}>{text}</Text>;

function Header({ l }: { l: McpListing }) {
  return (
    <>
      <View style={{ gap: 4 }}>
        <Text size={22} weight="semi">{l.title}</Text>
        <Text size={12.5} color="muted">{[l.publisher, l.version ? `v${l.version}` : ''].filter(Boolean).join(' · ')}</Text>
      </View>
      {l.description ? <Text color="text2" style={{ lineHeight: 22 }}>{l.description}</Text> : null}
    </>
  );
}

function Links({ l }: { l: McpListing }) {
  if (!l.websiteUrl && !l.repoUrl) return null;
  return (
    <Card>
      {l.websiteUrl ? <ListRow icon="globe" label="Website" onPress={() => Linking.openURL(l.websiteUrl!)} last={!l.repoUrl} /> : null}
      {l.repoUrl ? <ListRow icon="link" label="Source code" onPress={() => Linking.openURL(l.repoUrl!)} last /> : null}
    </Card>
  );
}

function Notice({ icon, children }: { icon: 'info' | 'warn' | 'lock'; children: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
      <Icon name={icon} size={18} color={colors.warn} />
      <Text size={13} color="text2" style={{ flex: 1, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

// ---------------- a hosted server ----------------

function Hosted({ listing }: { listing: McpListing }) {
  const servers = useLibrary((s) => s.servers);
  const plan = planMcp(listing);
  const url = listing.remote!.url;
  const hasUrlVariables = plan.fields.some((f) => f.key !== '@token');
  const existing = servers.find((s) => s.url.replace(/\/+$/, '') === url.replace(/\/+$/, ''));

  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Ask the server what sign-in it wants (unless its address still has blanks to fill in).
  const [probe, setProbe] = useState<{ url: string; kind: Kind } | null>(null);
  const supported = plan.supported;
  const added = !!existing;
  useEffect(() => {
    if (!supported || hasUrlVariables || added) return;
    let alive = true;
    probeAuth(url).then((k) => alive && setProbe({ url, kind: k }));
    return () => {
      alive = false;
    };
  }, [url, supported, hasUrlVariables, added]);
  const probing = supported && !hasUrlVariables && !added && probe?.url !== url;
  const kind: Kind = probe?.url === url ? probe.kind : 'unknown';

  const get = (key: string, fallback?: string) => values[key] ?? fallback ?? '';
  // A server that wants a token but doesn't say how: let the user paste one.
  const extraToken = kind === 'token' && !plan.fields.some((f) => f.key === '@token');
  const missing = plan.fields.filter((f) => f.required && !get(f.key, f.default).trim());
  const needsExtra = extraToken && !get('@token').trim();
  const slug = slugify(listing.title);

  const add = async () => {
    if (!plan.supported || busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const filled = Object.fromEntries([...plan.fields.map((f) => [f.key, get(f.key, f.default)]), ['@token', get('@token')]]);
      const conn = buildMcpConnection(listing, plan, filled);
      const browser = kind === 'oauth' && !conn.token;
      const r = await addAndConnect(
        {
          name: listing.title,
          url: conn.url,
          transport: 'http',
          auth: browser ? 'oauth' : conn.token ? 'token' : 'none',
          authHeader: conn.headerName && conn.headerName.toLowerCase() !== 'authorization' ? conn.headerName : null,
          authTemplate: conn.headerTemplate && conn.headerTemplate !== 'Bearer {token}' ? conn.headerTemplate : null,
          // Not in every new chat: you turn it on where you want it (the Tools button, or /name).
          enabledByDefault: false,
        },
        browser ? undefined : conn.token ?? '',
      );
      haptic.success();
      setOutcome({ ok: true, id: r.id, tools: r.tools });
    } catch (e: any) {
      // Don't keep a server that never connected; adding it again after fixing the problem starts clean.
      if (e?.serverId) await removeServer(e.serverId).catch(() => {});
      const hadToken = plan.fields.some((f) => f.key === '@token') || extraToken;
      setOutcome({
        ok: false,
        text:
          e instanceof OAuthError
            ? e.message
            : e?.status === 401
              ? hadToken
                ? 'The server rejected that token. Check it and try again.'
                : 'This server asks you to sign in, but the sign-in could not be set up. If the service offers access tokens, use its own page to create one and add the server by hand (Settings › MCP servers).'
              : e?.message ?? 'Could not connect.',
      });
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? (kind === 'oauth' ? 'Waiting for sign-in…' : 'Connecting…') : kind === 'oauth' ? 'Sign in and add' : 'Add and connect';

  return (
    <Screen
      header={{ title: listing.title }}
      footer={
        existing ? (
          <Button label="Open server" flex onPress={() => router.replace({ pathname: '/mcp-detail', params: { id: existing.id } })} />
        ) : outcome?.ok ? (
          <Button label="Open server" flex onPress={() => router.replace({ pathname: '/mcp-detail', params: { id: outcome.id } })} />
        ) : plan.supported ? (
          <Button label={label} flex disabled={busy || probing || missing.length > 0 || needsExtra} onPress={add} />
        ) : undefined
      }>
      <Header l={listing} />
      {!plan.supported && <Notice icon="info">{plan.reason ?? ''}</Notice>}
      {existing && (
        <Card>
          <ListRow icon="check" label="Already added" sub={existing.connected ? `${existing.tools.length} tools` : 'Not connected right now'} last />
        </Card>
      )}

      {plan.supported && !existing && !outcome?.ok && (
        <>
          {kind === 'oauth' && (
            <Card>
              <ListRow icon="lock" label="Sign-in: your browser" sub={`Your browser opens so you can sign in to ${listing.title}. AI Hat registers itself with the service automatically; nothing to set up.`} last />
            </Card>
          )}
          {(plan.fields.length > 0 || extraToken) && (
            <View style={{ gap: 14 }}>
              <SectionTitle>What it needs</SectionTitle>
              {plan.fields.map((f) =>
                f.choices ? (
                  <View key={f.key} style={{ gap: 8 }}>
                    <Text size={12.5} weight="medium" color="muted">{f.label}{f.required ? '' : ' (optional)'}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {f.choices.map((c) => <Chip key={c} label={c} selected={get(f.key, f.default) === c} onPress={() => setValues((v) => ({ ...v, [f.key]: c }))} />)}
                    </View>
                    {f.hint ? <Text size={12} color="muted">{f.hint}</Text> : null}
                  </View>
                ) : (
                  <Field
                    key={f.key}
                    label={`${f.label}${f.required ? '' : ' (optional)'}`}
                    value={get(f.key, f.default)}
                    onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
                    secureTextEntry={f.secret}
                    hint={f.hint ? `${f.hint}${f.secret ? ' Stored only in this phone’s secure keystore.' : ''}` : f.secret ? 'Stored only in this phone’s secure keystore.' : undefined}
                  />
                ),
              )}
              {extraToken && (
                <Field label="Access token" value={get('@token')} onChangeText={(t) => setValues((v) => ({ ...v, '@token': t }))} secureTextEntry hint="This server asks for a token but doesn’t say how to get one. Look on its website. Stored only in this phone’s secure keystore." />
              )}
            </View>
          )}
          <Card>
            <ListRow label="Address" value={url.replace(/^https?:\/\//, '')} />
            <ListRow label="Connection" value="Streamable HTTP" last />
          </Card>
          {hint('Anyone can publish to the registry. Add only servers you trust: what the assistant sends to a tool goes to that server. Tools that write or delete ask you first.')}
        </>
      )}

      {outcome && (
        <Card>
          <ListRow icon={outcome.ok ? 'check' : 'warn'} danger={!outcome.ok} label={outcome.ok ? `Connected · ${outcome.tools} tool${outcome.tools === 1 ? '' : 's'} found` : outcome.text} sub={outcome.ok ? `Turn it on in a chat with the Tools button, or type /${slug}. Tools that change things ask first.` : undefined} last />
        </Card>
      )}
      <Links l={listing} />
    </Screen>
  );
}

// ---------------- a server that runs on a computer ----------------

function Computer({ listing }: { listing: McpListing }) {
  const { colors } = useTheme();
  const servers = useLibrary((s) => s.servers);
  const plan = computerPlan(listing);
  // The key protects the bridge: made once here, used in the command and as the token when the server is added.
  const [key] = useState(() => newKey((n) => Crypto.getRandomBytes(n)));
  const [values, setValues] = useState<Record<string, string>>({});
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const get = (k: string, fallback?: string) => values[k] ?? fallback ?? '';
  const missing = plan.fields.filter((f) => f.required && !get(f.key, f.default).trim());
  const command = plan.supported ? bridgeCommand(plan.build(Object.fromEntries(plan.fields.map((f) => [f.key, get(f.key, f.default)]))), { key }) : '';
  const url = bridgeUrl(address);
  const existing = servers.find((s) => url && s.url === url);

  const add = async () => {
    if (!url || busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const r = await addAndConnect({ name: listing.title, url, transport: 'http', auth: 'token', enabledByDefault: false }, key);
      haptic.success();
      setOutcome({ ok: true, id: r.id, tools: r.tools });
    } catch (e: any) {
      if (e?.serverId) await removeServer(e.serverId).catch(() => {});
      setOutcome({
        ok: false,
        text: e?.status === 401 ? 'The bridge refused the key. Run the command above again and use that exact key.' : `Couldn’t reach ${url}. Is the command still running, and are the phone and the computer on the same network? On iPhone, allow Local Network for AI Hat in Settings.`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={{ title: listing.title }}
      footer={
        outcome?.ok ? (
          <Button label="Open server" flex onPress={() => router.replace({ pathname: '/mcp-detail', params: { id: outcome.id } })} />
        ) : plan.supported ? (
          <Button label={busy ? 'Connecting…' : existing ? 'Already added' : 'Add and connect'} flex disabled={busy || !url || !!existing || missing.length > 0} onPress={add} />
        ) : undefined
      }>
      <Header l={listing} />
      {!plan.supported ? (
        <Notice icon="info">{plan.reason ?? ''}</Notice>
      ) : (
        <>
          <Notice icon="info">
            {`This server is a program that runs on a computer. A phone can’t start it, so you run it on your computer behind a small bridge (supergateway, needs Node.js${plan.runner === 'uvx' ? ' and uv' : plan.runner === 'docker' ? ' and Docker' : ''}), then AI Hat connects to it over your network.`}
          </Notice>

          {plan.fields.length > 0 && (
            <View style={{ gap: 14 }}>
              <SectionTitle>Settings for the server</SectionTitle>
              {plan.fields.map((f) =>
                f.choices ? (
                  <View key={f.key} style={{ gap: 8 }}>
                    <Text size={12.5} weight="medium" color="muted">{f.label}{f.required ? '' : ' (optional)'}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {f.choices.map((c) => <Chip key={c} label={c} selected={get(f.key, f.default) === c} onPress={() => setValues((v) => ({ ...v, [f.key]: c }))} />)}
                    </View>
                  </View>
                ) : (
                  <Field key={f.key} label={`${f.label}${f.required ? '' : ' (optional)'}`} value={get(f.key, f.default)} onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))} secureTextEntry={f.secret} hint={f.hint} />
                ),
              )}
            </View>
          )}

          <View style={{ gap: 8 }}>
            <SectionTitle>1. Run this on your computer</SectionTitle>
            <Card style={{ padding: 14, gap: 12 }}>
              <Text mono size={12} color="text2" selectable>{command}</Text>
              <Button
                label="Copy command"
                variant="outline"
                height={40}
                onPress={async () => {
                  await Clipboard.setStringAsync(command);
                  haptic.success();
                  toast('Command copied');
                }}
              />
            </Card>
            {hint('For macOS, Linux, or Windows through WSL or Git Bash. Leave it running while you use the server (stop it with Ctrl+C). The key in the command is made just for this server; anyone on your network who has it could use the server, so keep it private.')}
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle>2. Tell AI Hat where it is</SectionTitle>
            <Field label="Your computer’s address" value={address} onChangeText={setAddress} keyboardType="url" placeholder="192.168.1.20" hint="The phone and the computer must be on the same Wi-Fi (or share a network such as Tailscale). Find the address with: ipconfig getifaddr en0 (Mac), hostname -I (Linux) or ipconfig (Windows)." />
            {url ? <Text mono size={12} color="muted">{url}</Text> : null}
          </View>
          {existing && (
            <Card>
              <ListRow icon="check" label="Already added" sub={existing.name} onPress={() => router.replace({ pathname: '/mcp-detail', params: { id: existing.id } })} last />
            </Card>
          )}
        </>
      )}

      {outcome && (
        <Card>
          <ListRow icon={outcome.ok ? 'check' : 'warn'} danger={!outcome.ok} label={outcome.ok ? `Connected · ${outcome.tools} tool${outcome.tools === 1 ? '' : 's'} found` : outcome.text} sub={outcome.ok ? 'Keep the command running on your computer while you use it. Tools that change things ask first.' : undefined} last />
        </Card>
      )}
      <View style={{ height: 1, backgroundColor: colors.hairline }} />
      <Links l={listing} />
    </Screen>
  );
}

export default function MarketMcp() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = id ? recallMcp(id) : undefined;
  if (!listing) {
    return (
      <Screen header={{ title: 'MCP server' }}>
        <Text color="muted">Open this server from the marketplace list.</Text>
        <Button label="Back to the marketplace" variant="outline" onPress={() => router.replace({ pathname: '/market', params: { tab: 'mcp' } })} />
      </Screen>
    );
  }
  return listing.remote ? <Hosted listing={listing} /> : <Computer listing={listing} />;
}
