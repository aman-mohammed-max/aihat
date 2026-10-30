import { Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { Button, Icon, ListRow, Screen, SectionTitle, Segmented, Text } from '@/components';
import { startChatWith } from '@/components/LocalModels';
import { device } from '@/lib/device';
import { gb } from '@/lib/local/catalog';
import { PHONON_DOWNLOAD, usePhonon } from '@/lib/local/phonon';
import { isLocalProvider } from '@/lib/local/provider';
import { useLocalInference } from '@/store/localInference';
import { useLocalModels } from '@/store/localModels';
import { useProviders } from '@/store/providers';
import { useSettings, type Settings } from '@/store/settings';
import { useTheme } from '@/theme';

/** Models on this phone or tablet: storage, downloads, what is installed, and how the models run. */
export default function DeviceModels() {
  const { colors } = useTheme();
  const { models, jobs, remove, pause, resume, cancel } = useLocalModels();
  const inference = useLocalInference();
  const ph = usePhonon();
  const refresh = usePhonon((s) => s.refresh);
  useEffect(() => refresh(), [refresh]);
  const s = useSettings();
  const computePreference = Platform.OS === 'ios' && s.localCompute === 'npu' ? 'auto' : s.localCompute;
  const computeOptions: { value: Settings['localCompute']; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'cpu', label: 'CPU' },
    { value: 'gpu', label: 'GPU' },
    ...(Platform.OS === 'android' ? [{ value: 'npu' as const, label: 'NPU' }] : []),
  ];
  const local = useProviders((st) => st.providers.find(isLocalProvider));
  const running = Object.values(jobs);

  const phononOn = ph.phase === 'ready';
  const phononActivity = ph.phase !== 'none' && ph.phase !== 'ready';
  const phononWritten = ph.phase === 'preparing' ? PHONON_DOWNLOAD + ph.extractWritten : ph.written;
  const used = models.reduce((n, m) => n + m.size, 0) + (phononOn ? PHONON_DOWNLOAD : 0);
  const loading = running.reduce((n, j) => n + j.written, 0) + (phononActivity ? phononWritten : 0);
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
          {[{ c: colors.accent, t: 'Downloaded' }, { c: '#7DD3FC', t: 'In progress' }].map((k) => (
            <View key={k.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.c }} />
              <Text size={12} color="muted">{k.t}</Text>
            </View>
          ))}
        </View>
      </View>

      {running.length || phononActivity ? (
        <View style={{ gap: 6 }}>
          <SectionTitle space={0}>Model activity</SectionTitle>
          {phononActivity ? (() => {
            const preparing = ph.phase === 'preparing';
            const progress = preparing
              ? ph.extractTotal ? Math.min(100, Math.round((ph.extractWritten / ph.extractTotal) * 100)) : 0
              : Math.min(100, Math.round((ph.written / PHONON_DOWNLOAD) * 100));
            const cancellable = ph.phase === 'downloading' || ph.phase === 'paused' || preparing;
            const label = ph.phase === 'downloading' ? `${progress}% · downloading · tap to pause`
              : ph.phase === 'paused' ? `${progress}% · paused · tap to resume`
                : preparing ? `${ph.extractTotal ? `${progress}% · ` : ''}installing · tap to cancel`
                  : ph.phase === 'failed' ? `${ph.error || 'Stopped'} · tap to retry`
                    : 'Checking installed files…';
            const activate = () => {
              if (ph.phase === 'downloading') ph.pause();
              else if (ph.phase === 'paused' || ph.phase === 'failed') {
                void ph.download().catch((error: Error) => Alert.alert('Couldn’t download Phonon-2', error.message));
              } else if (preparing) ph.cancel();
            };
            return (
              <View key="phonon-activity" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.surface }}>
                <Pressable
                  accessibilityRole={ph.phase === 'verifying' ? undefined : 'button'}
                  accessibilityLabel={ph.phase === 'downloading' ? 'Pause Phonon-2 download' : ph.phase === 'paused' ? 'Resume Phonon-2 download' : preparing ? 'Cancel Phonon-2 installation' : ph.phase === 'failed' ? 'Retry Phonon-2 download' : 'Checking Phonon-2 files'}
                  disabled={ph.phase === 'verifying'}
                  onPress={activate}
                  style={{ flex: 1, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text size={15} weight="medium" numberOfLines={1} style={{ flex: 1 }}>Phonon-2 · speech</Text>
                    <Text size={12.5} color="muted">{preparing ? `${gb(ph.extractWritten)} of ${gb(ph.extractTotal)} extracted` : `${gb(ph.written)} of ${gb(PHONON_DOWNLOAD)}`}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ width: `${progress}%`, height: 6, backgroundColor: '#7DD3FC' }} />
                  </View>
                  <Text size={12} color={ph.phase === 'failed' ? 'danger' : 'muted'}>{label}</Text>
                </Pressable>
                {cancellable ? <Button label="Cancel" variant="danger" height={36} textSize={12} onPress={ph.cancel} /> : null}
              </View>
            );
          })() : null}
          {running.map((j) => {
            const pct = j.size ? Math.min(100, Math.round((j.written / j.size) * 100)) : 0;
            return (
              <Pressable key={j.id} accessibilityRole={j.state === 'queued' || j.state === 'active' || j.state === 'paused' || j.state === 'failed' ? 'button' : undefined} accessibilityLabel={j.state === 'queued' ? `Cancel queued download for ${j.name}` : undefined} disabled={j.state === 'verifying' || j.state === 'installing'} onPress={() => (j.state === 'queued' ? cancel(j.id) : j.state === 'active' ? pause(j.id) : void resume(j.id))} style={{ gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.surface, opacity: j.state === 'verifying' || j.state === 'installing' ? 0.8 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text size={15} weight="medium" numberOfLines={1} style={{ flex: 1 }}>{j.name}</Text>
                  <Text size={12.5} color="muted">{`${gb(j.written)} of ${gb(j.size)}`}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: 6, backgroundColor: '#7DD3FC' }} />
                </View>
                <Text size={12} color={j.state === 'failed' ? 'danger' : 'muted'}>{j.state === 'queued' ? 'Waiting for a download slot · tap to cancel' : j.state === 'failed' ? `${j.error ?? 'Stopped'} · tap to try again` : j.state === 'paused' ? `${pct}% · paused · tap to resume` : `${pct}% · tap to pause`}</Text>
                {j.state === 'verifying' ? <Text size={12} color="muted">Checking file size, GGUF format, and publisher checksum…</Text> : null}
                {j.state === 'installing' ? <Text size={12} color="muted">Committing the verified model safely…</Text> : null}
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
            const isRemoving = inference.removing.includes(m.id);
            const runtimeLabel = isRemoving ? 'Removing' : inference.modelId === m.id
              ? inference.phase === 'loaded' ? `Loaded · ${inference.backendLabel ?? 'backend unknown'}` : inference.phase === 'loading' ? 'Loading' : inference.phase === 'error' ? 'Load failed' : ''
              : '';
            return (
              <View key={m.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Start a chat with ${m.name}`} disabled={isRemoving} onPress={() => startChatWith(m.id, m.name)} style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text size={15} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>{m.name}</Text>
                    {isDefault ? (
                      <View style={{ borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: colors.accent }}>
                        <Text size={10.5} weight="semi" color="onAccent">DEFAULT</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text size={12} color="muted">{`Chat · ${gb(m.size)}${runtimeLabel ? ` · ${runtimeLabel}` : ''}`}</Text>
                  {inference.modelId === m.id && inference.phase === 'loaded' && inference.fallbackReason ? <Text size={11.5} color="muted" numberOfLines={2}>{inference.fallbackReason}</Text> : null}
                  {inference.modelId === m.id && inference.phase === 'error' && inference.error ? <Text size={11.5} color="danger" numberOfLines={1}>{inference.error}</Text> : null}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={isRemoving ? `Removing ${m.name}` : `Delete ${m.name}`} disabled={isRemoving} onPress={() => ask(m.name, m.size, () => void remove(m.id).catch((error: Error) => Alert.alert('Couldn’t remove model', error.message)))} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: isRemoving ? 0.5 : 1 }}>
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
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 8 }}>
          <Text size={13} weight="medium">Preferred hardware</Text>
          <Segmented
            options={computeOptions}
            value={computePreference}
            onChange={(localCompute) => s.set({ localCompute })}
          />
          <Text size={12} color="muted" style={{ lineHeight: 17 }}>{Platform.OS === 'ios'
            ? 'Auto uses Metal when available. This GGUF engine does not use Apple Neural Engine. Unsupported choices fall back to CPU.'
            : 'Auto checks each model and available hardware. Android GPU needs OpenCL and Q4_0 or Q6_K; experimental Hexagon NPU is opt-in. Unsupported choices fall back to CPU.'}</Text>
          <ListRow label="Free memory when idle" sub="Lets the model go after 5 minutes without a reply" height={56} toggle={{ on: s.localUnloadIdle, onChange: (localUnloadIdle) => s.set({ localUnloadIdle }) }} />
        </View>
      </View>
    </Screen>
  );
}
