import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { OAuthError } from '@/api/oauth';
import { Button, Screen, Text, Field } from '@/components';
import { addAndConnect, CONNECTORS, removeServer } from '@/lib/mcp-connect';


/** Token sign-in for a connector. OAuth redirect flows need a per-provider client id and aren't wired yet. */
export default function ConnectorAuth() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const c = CONNECTORS.find((x) => x.key === key);
  const [url, setUrl] = useState(c?.url ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  if (!c) return null;

  const go = async () => {
    setBusy(true);
    try {
      await addAndConnect({ name: c.name, url: url.trim(), auth: 'token', isConnector: true }, token.trim());
      router.replace('/connectors');
    } catch (e: any) {
      Alert.alert('Could not connect', e.status === 401 ? 'The token was rejected.' : e.message);
    } finally { setBusy(false); }
  };

  /** Sign in with the browser: the service's own page asks you to allow AI Hat. No token to create. */
  const goBrowser = async () => {
    setBusy(true);
    try {
      await addAndConnect({ name: c.name, url: url.trim(), auth: 'oauth', isConnector: true });
      router.replace('/connectors');
    } catch (e: any) {
      if (e?.serverId) await removeServer(e.serverId).catch(() => {});
      if (!(e instanceof OAuthError && e.code === 'cancelled')) Alert.alert('Could not sign in', e instanceof OAuthError ? e.message : e.status === 401 ? 'The service turned the sign-in down.' : e.message);
    } finally { setBusy(false); }
  };

  return (
    <Screen header={{ left: 'back', title: 'Connect' }} footer={<><Button label={busy ? 'Connecting…' : token ? 'Connect with token' : 'Sign in with browser'} flex onPress={token ? go : goBrowser} disabled={busy || !url} /><Button label="Not now" variant="outline" onPress={() => router.back()} /></>}>
      <View style={{ gap: 6 }}>
        <Text size={24} weight="semi">Connect {c.name}</Text>
        <Text color="muted">Your token is stored only in this phone’s secure keystore.</Text>
      </View>
      <Field label="MCP server URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="https://…/mcp" hint={c.url ? undefined : `${c.name} has no public MCP endpoint built in; paste your server's URL.`} />
      <Field label="Access token (optional)" value={token} onChangeText={setToken} secureTextEntry hint={c.auth === 'oauth' ? 'Leave this empty to sign in with your browser instead.' : 'Create a personal access token in the service’s settings, or leave it empty to try signing in with your browser.'} />
    </Screen>
  );
}
