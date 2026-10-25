import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View, type PressableStateCallbackType } from 'react-native';

import { Button, Card, Icon, ListRow, Screen, Text } from '@/components';
import { ProviderDetail } from '@/components/ProviderDetail';
import { SettingsShell } from '@/components/SettingsNav';
import { useLayout } from '@/lib/layout';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useProviders, type Provider } from '@/store/providers';
import { fonts, useTheme } from '@/theme';

const dot = { online: '#86EFAC', offline: '#FDBA74', rejected: '#F2A2A2', unknown: '#6F747C' } as const;
const label = (p: Provider, n: number) =>
  p.status === 'rejected' ? 'Key rejected' : p.status === 'offline' ? 'Offline' : p.status === 'online' ? `${n} model${n === 1 ? '' : 's'}` : 'Not tested';

export default function Providers() {
  const { kind } = useLayout();
  return kind === 'desktop' ? <ProvidersDesktop /> : <ProvidersList />;
}

function ProviderRow({ p, n, onPress, selected, last }: { p: Provider; n: number; onPress: () => void; selected?: boolean; last?: boolean }) {
  const { colors } = useTheme();
  const bg = (s: PressableStateCallbackType) => (selected ? colors.surface2 : (s as { hovered?: boolean }).hovered ? colors.surface : 'transparent');
  return (
    <Pressable accessibilityRole="button" accessibilityState={selected === undefined ? undefined : { selected }} onPress={onPress} style={(s) => ({ minHeight: 64, padding: selected === undefined ? 14 : 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: selected === undefined ? 0 : 12, backgroundColor: selected === undefined ? undefined : bg(s), borderBottomWidth: last || selected !== undefined ? 0 : 1, borderBottomColor: colors.hairline })}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Text weight="semi" size={12}>{p.name.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</Text>
          {p.isDefault && <Text size={10.5} weight="medium" color="accent">DEFAULT</Text>}
        </View>
        <Text mono size={12} color="muted" numberOfLines={1}>{p.baseUrl.replace(/^https?:\/\//, '')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot[p.status] }} />
          <Text size={12.5} color="text2">{label(p, n)}</Text>
        </View>
        {p.latencyMs ? <Text mono size={11.5} color="muted">{p.latencyMs} ms</Text> : null}
      </View>
    </Pressable>
  );
}

/** Phone and tablet: the list; an endpoint opens as its own page. */
function ProvidersList() {
  const { providers, models } = useProviders();
  const refresh = useRefreshModels();
  return (
    <Screen header={{ title: 'Providers', right: 'add', addLabel: 'Add endpoint', onAdd: () => router.push('/add-provider') }} footer={<Button label="Add endpoint" flex onPress={() => router.push('/add-provider')} />}>
      {providers.length > 0 && (
        <Card>
          <ListRow icon="refresh" label="Refresh all models" sub="Fetch every endpoint's model list again" value={refresh.busy ? 'Fetching…' : refresh.note || undefined} onPress={refresh.run} last />
        </Card>
      )}
      {providers.length === 0 && <Text color="muted">No endpoints yet. Add an OpenAI-compatible server to start chatting.</Text>}
      <Card>
        {providers.map((p, i) => (
          <ProviderRow key={p.id} p={p} n={models.filter((m) => m.providerId === p.id).length} onPress={() => router.push({ pathname: '/provider-detail', params: { id: p.id } })} last={i === providers.length - 1} />
        ))}
      </Card>
    </Screen>
  );
}

/** Computer: settings sections, the endpoints, and the chosen endpoint, side by side (three panes). */
function ProvidersDesktop() {
  const { colors } = useTheme();
  const { providers, models } = useProviders();
  const refresh = useRefreshModels();
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const list = providers.filter((p) => `${p.name} ${p.baseUrl}`.toLowerCase().includes(q.toLowerCase()));
  const selected = providers.find((p) => p.id === picked) ?? providers.find((p) => p.isDefault) ?? providers[0];

  return (
    <SettingsShell>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
        <View style={{ flex: 1, minWidth: 320, maxWidth: 460, borderRightWidth: 1, borderRightColor: colors.hairline }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 18, paddingBottom: 12, paddingLeft: 24, paddingRight: 20 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={20} weight="semi">Providers & endpoints</Text>
              <Text size={12.5} color="muted">{`${providers.length} endpoints · ${models.length} models`}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Add endpoint" onPress={() => router.push('/add-provider')} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={15} color={colors.onAccent} strokeWidth={2.2} />
              <Text size={13.5} weight="semi" style={{ color: colors.onAccent }}>Add</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
            <View style={{ height: 40, borderRadius: 12, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }}>
              <Icon name="search" size={16} color={colors.muted} />
              <TextInput accessibilityLabel="Filter providers" value={q} onChangeText={setQ} placeholder="Filter" placeholderTextColor={colors.muted} style={[{ flex: 1, color: colors.text, fontSize: 14, fontFamily: fonts.ui }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]} />
            </View>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, gap: 2 }}>
            {providers.length === 0 && <Text color="muted" style={{ padding: 12 }}>No endpoints yet. Add an OpenAI-compatible server to start chatting.</Text>}
            {list.map((p) => (
              <ProviderRow key={p.id} p={p} n={models.filter((m) => m.providerId === p.id).length} selected={p.id === selected?.id} onPress={() => setPicked(p.id)} />
            ))}
          </ScrollView>
          <View style={{ padding: 14, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.hairline }}>
            <Button label={refresh.busy ? 'Fetching…' : 'Refresh all models'} variant="outline" onPress={refresh.run} disabled={refresh.busy} />
            {refresh.note ? <Text size={12} color="muted" style={{ marginTop: 6 }}>{refresh.note}</Text> : null}
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {selected ? <ProviderDetail key={selected.id} id={selected.id} embedded onRemoved={() => setPicked(null)} /> : null}
        </View>
      </View>
    </SettingsShell>
  );
}
