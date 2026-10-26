import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View, type PressableStateCallbackType } from 'react-native';

import { Button, Icon, Screen, Text, Tile } from '@/components';
import { ProviderDetail } from '@/components/ProviderDetail';
import { SettingsShell } from '@/components/SettingsNav';
import { useLayout } from '@/lib/layout';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useProviders, type Provider } from '@/store/providers';
import { fonts, useTheme } from '@/theme';

export default function Providers() {
  const { kind } = useLayout();
  return kind === 'desktop' ? <ProvidersDesktop /> : <ProvidersList />;
}

/** How an endpoint is doing: a dot and a word, coloured like the design (a ring when it can't be reached). */
function Status({ p, n }: { p: Provider; n: number }) {
  const { colors } = useTheme();
  const tone = p.status === 'rejected' ? colors.danger : p.status === 'offline' ? colors.warn : p.status === 'online' ? colors.text2 : colors.muted;
  const text = p.status === 'rejected' ? 'Key rejected' : p.status === 'offline' ? 'Offline' : p.status === 'online' ? `${n} model${n === 1 ? '' : 's'}` : 'Not tested';
  return (
    <View style={{ alignItems: 'flex-end', gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={p.status === 'offline' ? { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: colors.warn } : { width: 7, height: 7, borderRadius: 4, backgroundColor: p.status === 'online' ? colors.accent : p.status === 'rejected' ? colors.danger : colors.faint }} />
        <Text size={12} style={{ color: tone }}>{text}</Text>
      </View>
      {p.status === 'online' && p.latencyMs ? <Text mono size={11} color="muted">{p.latencyMs} ms</Text> : null}
    </View>
  );
}

function ProviderRow({ p, n, onPress, selected, last }: { p: Provider; n: number; onPress: () => void; selected?: boolean; last?: boolean }) {
  const { colors } = useTheme();
  const pane = selected !== undefined;
  const bg = (s: PressableStateCallbackType) => (selected ? colors.surface2 : (s as { hovered?: boolean }).hovered ? colors.surface : 'transparent');
  return (
    <Pressable accessibilityRole="button" accessibilityState={pane ? { selected } : undefined} onPress={onPress} style={(s) => ({ minHeight: 66, paddingHorizontal: pane ? 10 : 4, paddingVertical: pane ? 10 : 0, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: pane ? 12 : 0, backgroundColor: pane ? bg(s) : undefined, borderBottomWidth: last || pane ? 0 : 1, borderBottomColor: colors.hairline })}>
      <Tile icon={p.isDefault ? 'stack' : undefined} text={p.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text size={15} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</Text>
          {p.isDefault && (
            <View style={{ backgroundColor: colors.accent, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text size={10.5} weight="semi" color="onAccent">DEFAULT</Text>
            </View>
          )}
        </View>
        <Text mono size={11.5} color="muted" numberOfLines={1}>{p.baseUrl.replace(/^https?:\/\//, '')}</Text>
      </View>
      <Status p={p} n={n} />
    </Pressable>
  );
}

/** Phone and tablet: the list; an endpoint opens as its own page. */
function ProvidersList() {
  const { colors } = useTheme();
  const { providers, models } = useProviders();
  const refresh = useRefreshModels();
  return (
    <Screen
      header={{ title: 'Providers', sub: `${providers.length} endpoint${providers.length === 1 ? '' : 's'} · ${models.length} models`, right: 'add', addLabel: 'Add endpoint', onAdd: () => router.push('/add-provider') }}
      footer={<Button label="Add endpoint" flex height={48} onPress={() => router.push('/add-provider')} />}
      gap={0}>
      {providers.length === 0 && <Text color="muted" style={{ padding: 4 }}>No endpoints yet. Add an OpenAI-compatible server to start chatting.</Text>}
      {providers.length > 0 && (
        <Pressable accessibilityRole="button" onPress={refresh.run} style={{ minHeight: 52, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Tile icon="refresh" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text size={15}>Refresh all models</Text>
            <Text size={12} color="muted">Fetch every endpoint’s model list again</Text>
          </View>
          <Text size={12} color="muted">{refresh.busy ? 'Fetching…' : refresh.note || `${models.length} models`}</Text>
        </Pressable>
      )}
      {providers.map((p, i) => (
        <ProviderRow key={p.id} p={p} n={models.filter((m) => m.providerId === p.id).length} onPress={() => router.push({ pathname: '/provider-detail', params: { id: p.id } })} last={i === providers.length - 1} />
      ))}
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
