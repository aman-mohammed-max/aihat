import * as LocalAuth from 'expo-local-authentication';
import { router } from 'expo-router';
import { useState , useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Dialog, ListRow, Screen, SectionTitle, Text } from '@/components';
import { desktopInfo } from '@/lib/desktop';
import { device, isDesktop } from '@/lib/device';
import { getApiKey } from '@/lib/keys';
import { eraseAll } from '@/lib/backup';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

export default function Privacy() {
  const { colors } = useTheme();
  const s = useSettings();
  const providers = useProviders((x) => x.providers);
  const servers = useLibrary((x) => x.servers);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [keyStore, setKeyStore] = useState<'keychain' | 'file' | null>(null);

  useEffect(() => {
    if (isDesktop) desktopInfo().then((i) => setKeyStore(i.keyStore)).catch(() => {});
  }, []);
  const where = !isDesktop ? `stored in this ${device}’s secure keystore` : keyStore === 'file' ? 'in a private file (no keyring found)' : 'stored in your system keychain';

  useEffect(() => {
    const mask = (k: string | null) => (k ? `${k.slice(0, 5)}…${k.slice(-4)}` : null);
    Promise.all([
      ...providers.map(async (p) => [p.id, mask(await getApiKey(p.id))] as const),
      ...servers.map(async (v) => [`mcp.${v.id}`, mask(await getApiKey(`mcp.${v.id}`))] as const),
    ]).then((r) => setKeys(Object.fromEntries(r.filter(([, k]) => k) as [string, string][])));
  }, [providers, servers]);

  const setLock = async (on: boolean) => {
    if (on) {
      const ok = await LocalAuth.hasHardwareAsync() && (await LocalAuth.authenticateAsync({ promptMessage: 'Turn on app lock' })).success;
      if (!ok) return;
    }
    s.set({ appLock: on });
  };

  const rows = [
    ...providers.map((p) => ({ id: p.id, label: p.name, key: keys[p.id], state: p.status === 'rejected' ? 'Rejected' : keys[p.id] ? 'Saved' : 'No key', bad: p.status === 'rejected', open: () => router.push({ pathname: '/provider-detail', params: { id: p.id } }) })),
    ...servers.filter((v) => keys[`mcp.${v.id}`]).map((v) => ({ id: v.id, label: `${v.name} (MCP)`, key: `token ${keys[`mcp.${v.id}`]}`, state: 'Saved', bad: false, open: () => router.push({ pathname: '/mcp-detail', params: { id: v.id } }) })),
  ];

  return (
    <Screen header={{ title: 'Privacy & API keys' }} gap={16} footer={<Button label={`Erase all data on this ${device}`} variant="danger" flex onPress={() => setConfirm(true)} />}>
      <View>
        <SectionTitle>{`API keys · ${where}`}</SectionTitle>
        {rows.length === 0 && <ListRow label="No keys saved" height={50} />}
        {rows.map((r, i) => (
          <Pressable key={r.id} accessibilityRole="button" onPress={r.open} style={{ minHeight: 50, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={15}>{r.label}</Text>
              {r.key ? <Text mono size={12} color="muted">{r.key}</Text> : null}
            </View>
            <Text size={12.5} color={r.bad ? 'danger' : 'muted'}>{r.state}</Text>
          </Pressable>
        ))}
      </View>
      <View>
        <SectionTitle>{`On this ${device}`}</SectionTitle>
        {!isDesktop && <ListRow label="Lock with Face ID / fingerprint" sub="When the app opens" toggle={{ on: s.appLock, onChange: setLock }} />}
        {!isDesktop && <ListRow label="Hide chats in the app switcher" toggle={{ on: s.hideInSwitcher, onChange: (hideInSwitcher) => s.set({ hideInSwitcher }) }} />}
        <ListRow label="Warn before sending to cloud" sub="When a chat moves off a local model" toggle={{ on: s.cloudWarning, onChange: (cloudWarning) => s.set({ cloudWarning }) }} />
      </View>
      <Text size={13} color="muted" style={{ lineHeight: 19.5, paddingHorizontal: 4 }}>This app has no servers of its own. Messages go only to the endpoints you add; nothing is collected about you.</Text>
      {isDesktop && keyStore === 'file' ? <Text size={13} color="muted" style={{ lineHeight: 19.5, paddingHorizontal: 4 }}>No keyring is running on this computer, so keys are kept in a file in the app’s data folder that only your user account can read. Install and unlock GNOME Keyring or KWallet to keep them in a keyring instead.</Text> : null}
      <Dialog visible={confirm} onClose={() => setConfirm(false)} title="Erase everything?" message={`Chats, prompts, skills, endpoints and settings are removed from this ${device}. Back up first if you need them.`} confirmLabel="Erase" destructive onConfirm={async () => { await eraseAll(); setConfirm(false); router.replace('/welcome'); }} />
    </Screen>
  );
}
