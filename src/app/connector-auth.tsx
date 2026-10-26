import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { OAuthError } from '@/api/oauth';
import { Banner, Button, Field, Icon, Screen, Text } from '@/components';
import { keyPlace } from '@/lib/device';
import { addAndConnect, CONNECTORS, removeServer } from '@/lib/mcp-connect';
import { useTheme } from '@/theme';

/** Connect a ready-made server: sign in with the browser (the service's own page asks you to allow AI Hat), or paste a token. */
export default function ConnectorAuth() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { colors } = useTheme();
  const c = CONNECTORS.find((x) => x.key === key);
  const [url, setUrl] = useState(c?.url ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!c) return null;

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await addAndConnect({ name: c.name, url: url.trim(), auth: 'token', isConnector: true }, token.trim());
      router.replace('/connectors');
    } catch (e: any) {
      if (e?.serverId) await removeServer(e.serverId).catch(() => {});
      setError(e.status === 401 ? 'The token was rejected.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const goBrowser = async () => {
    setBusy(true);
    setError('');
    try {
      await addAndConnect({ name: c.name, url: url.trim(), auth: 'oauth', isConnector: true });
      router.replace('/connectors');
    } catch (e: any) {
      if (e?.serverId) await removeServer(e.serverId).catch(() => {});
      if (!(e instanceof OAuthError && e.code === 'cancelled')) setError(e instanceof OAuthError ? e.message : e.status === 401 ? 'The service turned the sign-in down.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={{ left: 'cancel', title: 'Connect' }}
      gap={22}
      footer={
        <View style={{ flex: 1, gap: 8 }}>
          <Button label={busy ? 'Connecting…' : token ? 'Connect with token' : 'Sign in with browser'} height={48} onPress={token ? go : goBrowser} disabled={busy || !url.trim()} />
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text size={14.5} color="muted">Not now</Text>
          </Pressable>
        </View>
      }>
      <View style={{ gap: 22, paddingHorizontal: 4, paddingTop: 12 }}>
        <View style={{ gap: 6 }}>
          <Text size={24} weight="semi">{`Connect ${c.name}`}</Text>
          <Text size={14} color="muted" style={{ lineHeight: 21 }}>{`Sign in with your browser: the service’s own page asks you to allow AI Hat, and no token is stored by hand. Tokens and sign-in are kept only in ${keyPlace}.`}</Text>
        </View>
        <Field label="MCP server URL" value={url} onChangeText={setUrl} mono keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://…/mcp" hint={c.url ? undefined : `${c.name} has no public MCP address built in; paste your server’s URL.`} />
        <Field label="Access token (optional)" value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} hint="Leave this empty to sign in with your browser instead." />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
          <Icon name="lock" size={18} color={colors.text2} />
          <Text size={13} color="text2" style={{ flex: 1, lineHeight: 19.5 }}>Works with services that let apps sign themselves up (Notion, Linear, Sentry, Vercel, Stripe and many more). GitHub and Asana need an access token.</Text>
        </View>
      </View>
    </Screen>
  );
}
