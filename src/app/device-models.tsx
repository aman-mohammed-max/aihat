import { Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { Button, Icon, ListRow, Screen, SectionTitle, Text } from '@/components';
import { startChatWith } from '@/components/LocalModels';
import { device } from '@/lib/device';
import { gb } from '@/lib/local/catalog';
import { PHONON_DOWNLOAD, usePhonon } from '@/lib/local/phonon';
import { isLocalProvider } from '@/lib/local/provider';
import { useLocalModels } from '@/store/localModels';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

/** Models on this phone or tablet: storage, downloads, what is installed, and how the models run. */
export default function DeviceModels() {
  const { colors } = useTheme();
  const { models, jobs, remove, pause, resume } = useLocalModels();
  const ph = usePhonon();
  const refresh = usePhonon((s) => s.refresh);
  useEffect(() => refresh(), [refresh]);
  const s = useSettings();
  const local = useProviders((st) => st.providers.find(isLocalProvider));
  const running = Object.values(jobs);

  const phononOn = ph.phase === 'ready';
  const used = models.reduce((n, m) => n + m.size, 0) + (phononOn ? PHONON_DOWNLOAD : 0);
  const loading = running.reduce((n, j) => n + j.written, 0) + (ph.phase === 'downloading' || ph.phase === 'paused' ? ph.written : 0);
  const free = Paths.availableDiskSpace || 0;
  const total = used + loading + free;
  const pctOf = (n: number) => (total ? Math.max(n ? 1 : 0, Math.round((n / total) * 100)) : 0);

  const ask = (name: string, size: number, go: () => void) =>
    Alert.alert(`Delete ${name}?`, `It frees ${gb(size)}. You can download it again later.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);

  return (
    <Screen header={{ title: `On this ${device}`, sub: 'Works offline' }} gap={20} footer={<Button label="Browse models" flex height={48} onPress={() => router.push({ pathname: '/market', params: { tab: 'models' } })} />}>
      <View style={{ gap: 10, backgroundColor: colors.surface, borderRadius: 16, padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text size={13.5}>Storage</Text>
          <Text size={13.5} color="muted">{`${gb(used)} used by models${free ? ` · ${gb(free)} free` : ''}`}</Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, flexDirection: 'row', overflow: 'hidden' }}>
          <View style={{ width: `${pctOf(used)}%`, backgroundColor: colors.accent }} />
          <View style={{ width: `${pctOf(loading)}%`, backgroundColor: '#7DD3FC' }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {[{ c: colors.accent, t: 'Downloaded' }, { c: '#7DD3FC', t: 'Downloading' }].map((k) => (
            <View key={k.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.c }} />
              <Text size={12} color="muted">{k.t}</Text>
            </View>
          ))}
        </View>
      </View>

      {running.length ? (
        <View style={{ gap: 6 }}>
          <SectionTitle space={0}>Downloading</SectionTitle>
          {running.map((j) => {
            const pct = j.size ? Math.min(100, Math.round((j.written / j.size) * 100)) : 0;
            return (
              <Pressable key={j.id} accessibilityRole="button" onPress={() => (j.state === 'active' ? pause(j.id) : void resume(j.id))} style={{ gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text size={15} weight="medium" numberOfLines={1} style={{ flex: 1 }}>{j.name}</Text>
                  <Text size={12.5} color="muted">{`${gb(j.written)} of ${gb(j.size)}`}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: 6, backgroundColor: '#7DD3FC' }} />
                </View>
                <Text size={12} color={j.state === 'failed' ? 'danger' : 'muted'}>{j.state === 'failed' ? `${j.error ?? 'Stopped'} · tap to try again` : j.state === 'paused' ? `${pct}% · paused · tap to resume` : `${pct}% · tap to pause`}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <SectionTitle space={0}>Downloaded</SectionTitle>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>
          {models.map((m) => {
            const isDefault = !!local && s.defaultProviderId === local.id && s.defaultModelId === m.id;
            return (
              <View key={m.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Start a chat with ${m.name}`} onPress={() => startChatWith(m.id, m.name)} style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text size={15} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>{m.name}</Text>
                    {isDefault ? (
                      <View style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: colors.accent }}>
                        <Text size={10.5} weight="semi" color="onAccent">DEFAULT</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text size={12} color="muted">{`Chat · ${gb(m.size)}`}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${m.name}`} onPress={() => ask(m.name, m.size, () => void remove(m.id))} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trash" size={18} color={colors.muted} />
                </Pressable>
              </View>
            );
          })}
          {phononOn ? (
            <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/audio')} style={{ flex: 1, gap: 3 }}>
                <Text size={15} weight="medium">Phonon-2</Text>
                <Text size={12} color="muted">{`Speech to text · ${gb(PHONON_DOWNLOAD)}${s.dictationEngine === 'phonon' ? ' · used by the mic button' : ''}`}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete Phonon-2"
                onPress={() => ask('Phonon-2', PHONON_DOWNLOAD, () => { ph.remove(); if (s.dictationEngine === 'phonon') s.set({ dictationEngine: 'phone' }); })}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trash" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
          {!models.length && !phononOn ? <Text size={13} color="muted" style={{ padding: 14 }}>Nothing downloaded yet.</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/market', params: { tab: 'models' } })} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }}>
            <Icon name="plus" size={18} color={colors.accent} strokeWidth={2} />
            <Text size={15} weight="medium" color="accent">Browse models</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <SectionTitle space={0}>How models run</SectionTitle>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 12 }}>
          {Platform.OS === 'ios' ? <ListRow label="Use the GPU" sub="Faster. Turn off if the phone gets hot" height={56} toggle={{ on: s.localGpu, onChange: (localGpu) => s.set({ localGpu }) }} /> : null}
          <ListRow label="Free memory when idle" sub="Lets the model go after 5 minutes without a reply" height={56} toggle={{ on: s.localUnloadIdle, onChange: (localUnloadIdle) => s.set({ localUnloadIdle }) }} />
        </View>
      </View>
    </Screen>
  );
}
