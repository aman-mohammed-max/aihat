import * as LocalAuth from 'expo-local-authentication';
import { router } from 'expo-router';
import { useState , useEffect } from 'react';
import { View } from 'react-native';

import { Card, Dialog, ListRow, Screen, SectionTitle, Text } from '@/components';
import { getApiKey } from '@/lib/keys';
import { eraseAll } from '@/lib/backup';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';

export default function Privacy() {
  const s = useSettings();
  const providers = useProviders((x) => x.providers);
  const servers = useLibrary((x) => x.servers);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    Promise.all(providers.map(async (p) => [p.id, await getApiKey(p.id)] as const)).then((r) =>
      setKeys(Object.fromEntries(r.filter(([, k]) => k).map(([id, k]) => [id, `${k!.slice(0, 5)}…${k!.slice(-4)}`]))),
    );
  }, [providers]);

  const setLock = async (on: boolean) => {
    if (on) {
      const ok = await LocalAuth.hasHardwareAsync() && (await LocalAuth.authenticateAsync({ promptMessage: 'Turn on app lock' })).success;
      if (!ok) return;
    }
    s.set({ appLock: on });
  };

  return (
    <Screen header={{ title: 'Privacy & API keys' }}>
      <View>
        <SectionTitle>API keys · stored in the phone’s secure keystore</SectionTitle>
        <Card>
          {providers.length === 0 && <ListRow label="No keys saved" last />}
          {providers.map((p, i) => (
            <ListRow key={p.id} label={p.name} mono sub={keys[p.id] ?? 'No key'} value={p.status === 'rejected' ? 'Rejected' : undefined} onPress={() => router.push({ pathname: '/provider-detail', params: { id: p.id } })} last={i === providers.length - 1 && servers.length === 0} />
          ))}
        </Card>
      </View>
      <View>
        <SectionTitle>On this phone</SectionTitle>
        <Card>
          <ListRow label="Lock with Face ID / fingerprint" sub="When the app opens" toggle={{ on: s.appLock, onChange: setLock }} />
          <ListRow label="Hide chats in the app switcher" toggle={{ on: s.hideInSwitcher, onChange: (hideInSwitcher) => s.set({ hideInSwitcher }) }} />
          <ListRow label="Warn before sending to cloud" sub="When a chat moves off a local model" toggle={{ on: s.cloudWarning, onChange: (cloudWarning) => s.set({ cloudWarning }) }} last />
        </Card>
      </View>
      <Text size={13} color="muted">This app has no servers of its own. Messages go only to the endpoints you add; nothing is collected about you.</Text>
      <Card><ListRow label="Erase all data on this phone" danger onPress={() => setConfirm(true)} last /></Card>
      <Dialog visible={confirm} onClose={() => setConfirm(false)} title="Erase everything?" message="Chats, prompts, skills, endpoints and settings are removed from this phone. Back up first if you need them." confirmLabel="Erase" destructive onConfirm={async () => { await eraseAll(); setConfirm(false); router.replace('/welcome'); }} />
    </Screen>
  );
}
