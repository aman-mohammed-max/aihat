import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';

import { Button, Card, Chip, Field, Icon, ListRow, Screen, SectionTitle, Text } from '@/components';
import { deleteApiKey } from '@/lib/keys';
import { addAndConnect } from '@/lib/mcp-connect';
import { buildMcpConnection, planMcp, recallMcp } from '@/lib/market';
import { slugify } from '@/lib/skills';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme';

type Outcome = { ok: true; id: string; tools: number } | { ok: false; text: string };

export default function MarketMcp() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = id ? recallMcp(id) : undefined;
  const servers = useLibrary((s) => s.servers);
  const plan = useMemo(() => (listing ? planMcp(listing) : null), [listing]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (!listing || !plan) {
    return (
      <Screen header={{ title: 'MCP server' }}>
        <Text color="muted">Open this server from the marketplace list.</Text>
        <Button label="Back to the marketplace" variant="outline" onPress={() => router.replace({ pathname: '/market', params: { tab: 'mcp' } })} />
      </Screen>
    );
  }

  const existing = servers.find((s) => listing.remote && s.url.replace(/\/+$/, '') === listing.remote.url.replace(/\/+$/, ''));
  const get = (key: string, fallback?: string) => values[key] ?? fallback ?? '';
  const missing = plan.fields.filter((f) => f.required && !get(f.key, f.default).trim());
  const slug = slugify(listing.title);

  const add = async () => {
    if (!plan.supported || busy) return;
    setBusy(true);
    setOutcome(null);
    let savedId: string | undefined;
    try {
      const filled = Object.fromEntries(plan.fields.map((f) => [f.key, get(f.key, f.default)]));
      const conn = buildMcpConnection(listing, plan, filled);
      const r = await addAndConnect(
        {
          name: listing.title,
          url: conn.url,
          transport: 'http',
          auth: conn.token ? 'token' : 'none',
          authHeader: conn.headerName && conn.headerName.toLowerCase() !== 'authorization' ? conn.headerName : null,
          authTemplate: conn.headerTemplate && conn.headerTemplate !== 'Bearer {token}' ? conn.headerTemplate : null,
          // Not in every new chat: you turn it on where you want it (the Tools button, or /name).
          enabledByDefault: false,
        },
        conn.token ?? '',
      );
      savedId = r.id;
      setOutcome({ ok: true, id: r.id, tools: r.tools });
    } catch (e: any) {
      // Don't keep a server that never connected; adding it again after fixing the problem starts clean.
      if (e?.serverId) {
        await useLibrary.getState().deleteServer(e.serverId);
        await deleteApiKey(`mcp.${e.serverId}`).catch(() => {});
      }
      const needsToken = plan.fields.some((f) => f.key === '@token');
      setOutcome({
        ok: false,
        text:
          e?.status === 401
            ? needsToken
              ? 'The server rejected that token. Check it and try again.'
              : 'This server asks you to sign in with your browser (OAuth), which the app can’t do yet. If the service offers access tokens, use its own page to create one, then add the server by hand from Settings › MCP servers.'
            : e?.message ?? 'Could not connect.',
      });
    } finally {
      setBusy(false);
      void savedId;
    }
  };

  return (
    <Screen
      header={{ title: listing.title }}
      footer={
        existing ? (
          <Button label="Open server" flex onPress={() => router.replace({ pathname: '/mcp-detail', params: { id: existing.id } })} />
        ) : outcome?.ok ? (
          <Button label="Open server" flex onPress={() => router.replace({ pathname: '/mcp-detail', params: { id: outcome.id } })} />
        ) : plan.supported ? (
          <Button label={busy ? 'Connecting…' : 'Add and connect'} flex disabled={busy || missing.length > 0} onPress={add} />
        ) : undefined
      }>
      <View style={{ gap: 4 }}>
        <Text size={22} weight="semi">{listing.title}</Text>
        <Text size={12.5} color="muted">{[listing.publisher, listing.version ? `v${listing.version}` : ''].filter(Boolean).join(' · ')}</Text>
      </View>
      {listing.description ? <Text color="text2" style={{ lineHeight: 22 }}>{listing.description}</Text> : null}

      {!plan.supported && (
        <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
          <Icon name="info" size={18} color={colors.warn} />
          <Text size={13} color="text2" style={{ flex: 1, lineHeight: 19 }}>{plan.reason}</Text>
        </View>
      )}

      {existing && (
        <Card>
          <ListRow icon="check" label="Already added" sub={existing.connected ? `${existing.tools.length} tools` : 'Not connected right now'} last />
        </Card>
      )}

      {plan.supported && !existing && !outcome?.ok && (
        <>
          {plan.fields.length > 0 && (
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
            </View>
          )}
          <Card>
            <ListRow label="Address" value={listing.remote!.url.replace(/^https?:\/\//, '')} />
            <ListRow label="Connection" value="Streamable HTTP" last />
          </Card>
          <Text size={12.5} color="muted" style={{ lineHeight: 18 }}>
            Anyone can publish to the registry. Add only servers you trust: what the assistant sends to a tool goes to that server. Tools that write or delete ask you first.
          </Text>
        </>
      )}

      {outcome && (
        <Card>
          <ListRow icon={outcome.ok ? 'check' : 'warn'} danger={!outcome.ok} label={outcome.ok ? `Connected · ${outcome.tools} tool${outcome.tools === 1 ? '' : 's'} found` : outcome.text} sub={outcome.ok ? `Turn it on in a chat with the Tools button, or type /${slug}. Tools that change things ask first.` : undefined} last />
        </Card>
      )}

      {(listing.websiteUrl || listing.repoUrl) && (
        <Card>
          {listing.websiteUrl ? <ListRow icon="globe" label="Website" onPress={() => Linking.openURL(listing.websiteUrl!)} last={!listing.repoUrl} /> : null}
          {listing.repoUrl ? <ListRow icon="link" label="Source code" onPress={() => Linking.openURL(listing.repoUrl!)} last /> : null}
        </Card>
      )}
    </Screen>
  );
}
