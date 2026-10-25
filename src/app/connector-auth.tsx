import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Screen, Text, Field } from '@/components';
import { addAndConnect, CONNECTORS } from '@/lib/mcp-connect';


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

  return (
    <Screen header={{ left: 'back', title: 'Connect' }} footer={<><Button label={busy ? 'Connecting…' : 'Connect'} flex onPress={go} disabled={busy || !url || !token} /><Button label="Not now" variant="outline" onPress={() => router.back()} /></>}>
      <View style={{ gap: 6 }}>
        <Text size={24} weight="semi">Connect {c.name}</Text>
        <Text color="muted">Your token is stored only in this phone’s secure keystore.</Text>
      </View>
      <Field label="MCP server URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="https://…/mcp" hint={c.url ? undefined : `${c.name} has no public MCP endpoint built in; paste your server's URL.`} />
      <Field label="Access token" value={token} onChangeText={setToken} secureTextEntry hint="Create a personal access token in the service’s settings." />
    </Screen>
  );
}
