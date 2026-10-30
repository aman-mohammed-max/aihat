import { Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';

import { device } from '@/lib/device';
import { gb, PICKED, prettyRepo, quantOf, searchRepos, type RepoHit } from '@/lib/local/catalog';
import { localEngineAvailable, UNAVAILABLE } from '@/lib/local/engine';
import { modelId } from '@/lib/local/files';
import { capacity, fit, thisDevice, type Fit } from '@/lib/local/fit';
import { PHONON_DOWNLOAD, phononSupported, usePhonon } from '@/lib/local/phonon';
import { isLocalProvider } from '@/lib/local/provider';
import { useLocalModels } from '@/store/localModels';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { useTheme } from '@/theme';

import { openChat } from './AppNav';
import { Banner, SectionTitle } from './Controls';
import { Icon } from './Icon';
import { PulseDots } from './Motion';
import { SearchBar } from './SearchBar';
import { Text } from './Text';

const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
export const fitShort = (f: Fit) => (f === 'good' ? 'Runs well' : f === 'ok' ? 'Slow here' : f === 'no' ? 'Too big' : '');

export function useFitColor() {
  const { colors } = useTheme();
  return (f: Fit) => (f === 'good' ? colors.accent : f === 'ok' ? colors.warn : f === 'no' ? colors.danger : colors.faint);
}

/** Make a downloaded model the one new chats use, and open a new chat. */
export function startChatWith(id: string, name: string) {
  const p = useProviders.getState().providers.find(isLocalProvider);
  if (!p) return;
  useSettings.getState().set({ defaultProviderId: p.id, defaultModelId: id });
  toast(`New chats use ${name}`);
  openChat('/');
}

export const openModel = (p: { repo: string; file?: string; name?: string }) => router.push({ pathname: '/market-model', params: p });

/** The button at the end of a row: Get, a download's percentage, Use. */
export function Pill({ label, tone = 'accent', onPress, a11y }: { label: string; tone?: 'accent' | 'plain' | 'muted'; onPress?: () => void; a11y?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      hitSlop={6}
      style={(s) => ({ minWidth: 64, height: 32, borderRadius: 16, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'muted' ? 'transparent' : (s as { hovered?: boolean }).hovered || s.pressed ? colors.selected : colors.surface2 })}>
      <Text size={13} weight="semi" color={tone === 'accent' ? 'accent' : tone === 'muted' ? 'muted' : 'text'}>{label}</Text>
    </Pressable>
  );
}

/** A row of the store: a lettered tile, the name, a two-line description, a line of facts, and its button. */
export function StoreRow({ name, desc, meta, f, pill, onPress }: { name: string; desc?: string; meta?: string; f?: Fit; pill?: React.ReactNode; onPress?: () => void }) {
  const { colors } = useTheme();
  const fitColor = useFitColor();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name}. ${desc ?? ''}`} onPress={onPress} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Text size={15} weight="semi">{(name.trim()[0] ?? '?').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text size={15} weight="medium" numberOfLines={1}>{name}</Text>
          {desc ? <Text size={12.5} color="muted" numberOfLines={2} style={{ lineHeight: 17 }}>{desc}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {f && f !== 'unknown' ? (
              <>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fitColor(f) }} />
                <Text size={11.5} style={{ color: fitColor(f) }}>{fitShort(f)}</Text>
                <Text size={11.5} color="faint">·</Text>
              </>
            ) : null}
            {meta ? <Text size={11.5} color="faint" numberOfLines={1} style={{ flexShrink: 1 }}>{meta}</Text> : null}
          </View>
        </View>
      </Pressable>
      {pill}
    </View>
  );
}

/** Get, the download's progress, or Use, for one model file. */
export function ModelPill({ repo, file, size, name }: { repo: string; file: string; size: number; name: string }) {
  const id = modelId(repo, file);
  const store = useLocalModels();
  const job = store.jobs[id];
  const have = store.models.find((m) => m.id === id);
  if (have) return <Pill label="Use" a11y={`Use ${name} in a new chat`} onPress={() => startChatWith(id, have.name)} />;
  if (job?.state === 'active') return <Pill label={`${job.size ? Math.round((job.written / job.size) * 100) : 0}%`} tone="plain" a11y="Pause the download" onPress={() => store.pause(id)} />;
  if (job) return <Pill label={job.state === 'paused' ? 'Resume' : 'Retry'} onPress={() => void store.resume(id)} />;
  const f = fit(size);
  const start = () => store.download({ repo, file, size, name }).catch((e: Error) => Alert.alert('Couldn’t download', e.message));
  return (
    <Pill
      label="Get"
      tone={f === 'no' || !localEngineAvailable() ? 'muted' : 'accent'}
      a11y={`Download ${name}`}
      onPress={() =>
        !localEngineAvailable()
          ? Alert.alert('Not in this build', UNAVAILABLE)
          : f === 'no'
            ? Alert.alert('This model is too big for this device', `It needs more memory than this ${device} can give one app, so it may not load or the app may close. Download it anyway?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Download anyway', onPress: start },
              ])
            : start()
      }
    />
  );
}

/** The Phonon-2 speech model as a store row: Get, progress, Use (as the dictation engine). */
function PhononRow() {
  const ph = usePhonon();
  const refresh = usePhonon((s) => s.refresh);
  const engine = useSettings((s) => s.dictationEngine);
  useEffect(() => refresh(), [refresh]);
  const supported = phononSupported();
  const pct = Math.min(100, Math.round((ph.written / PHONON_DOWNLOAD) * 100));
  const get = () =>
    ph.download().then(
      () => {
        if (usePhonon.getState().phase === 'ready') useSettings.getState().set({ dictationEngine: 'phonon' });
      },
      (e: Error) => Alert.alert('Couldn’t download Phonon-2', e.message),
    );
  const pill = !supported ? null : ph.phase === 'ready' ? (
    engine === 'phonon' ? <Pill label="In use" tone="muted" /> : <Pill label="Use" a11y="Use Phonon-2 for dictation" onPress={() => { useSettings.getState().set({ dictationEngine: 'phonon' }); toast('The mic now uses Phonon-2'); }} />
  ) : ph.phase === 'downloading' ? (
    <Pill label={`${pct}%`} tone="plain" a11y="Pause the download" onPress={ph.pause} />
  ) : ph.phase === 'paused' ? (
    <Pill label="Resume" onPress={get} />
  ) : ph.phase === 'preparing' ? (
    <Pill label="…" tone="plain" a11y="Unpacking" />
  ) : (
    <Pill label={ph.phase === 'failed' ? 'Retry' : 'Get'} a11y="Download Phonon-2" onPress={get} />
  );
  return (
    <StoreRow
      name="Phonon-2"
      desc="Speech to text on the device, for the mic button. English."
      f={supported ? 'good' : undefined}
      meta={supported ? `${gb(PHONON_DOWNLOAD)} · speech` : `${gb(PHONON_DOWNLOAD)} · speech · not on this ${device}`}
      pill={pill}
      onPress={() => router.push('/audio')}
    />
  );
}

/** What this device can run, with a link to the models on it. */
function DeviceCard() {
  const { colors } = useTheme();
  const models = useLocalModels((s) => s.models);
  const me = thisDevice();
  const cap = capacity(me.memory);
  const free = Paths.availableDiskSpace || 0;
  const used = models.reduce((n, m) => n + m.size, 0);
  const share = used + free ? Math.max(used ? 2 : 0, Math.round((used / (used + free)) * 100)) : 0;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/device-models')} style={(s) => ({ gap: 10, padding: 14, borderRadius: 16, backgroundColor: (s as { hovered?: boolean }).hovered ? colors.surface2 : colors.surface })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="chip" size={20} color={colors.text} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text size={15} weight="medium">{cap && cap.good ? `This ${device} can run models up to about ${cap.good}B${cap.ok > cap.good ? `, or ${cap.ok}B slowly` : ''}` : `Models run on this ${device}, offline`}</Text>
          <Text size={12} color="muted">{[me.name, me.memory ? `${gb(me.memory)} memory` : '', free ? `${gb(free)} free` : '', `${models.length} downloaded`].filter(Boolean).join(' · ')}</Text>
        </View>
        <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View style={{ width: `${share}%`, height: 6, backgroundColor: colors.accent }} />
      </View>
    </Pressable>
  );
}

type ChipId = 'all' | 'chat' | 'reasoning' | 'speech';
const CHIPS: { id: ChipId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'chat', label: 'Chat' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'speech', label: 'Speech' },
];

/** The design's filter chip: filled when chosen. */
export function FilterChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={{ height: 32, borderRadius: 16, paddingHorizontal: 13, justifyContent: 'center', borderWidth: 1, borderColor: on ? colors.text : colors.border, backgroundColor: on ? colors.text : 'transparent' }}>
      <Text size={13} style={{ color: on ? colors.bg : colors.text2 }}>{label}</Text>
    </Pressable>
  );
}

/** Marketplace › Models: models that run on this phone or tablet, without an endpoint. */
export function ModelsTab() {
  const [chip, setChip] = useState<ChipId>('all');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [hits, setHits] = useState<{ q: string; list: RepoHit[]; error?: string } | null>(null);

  useEffect(() => {
    if (!applied.trim()) return;
    let alive = true;
    searchRepos(applied).then(
      (list) => alive && setHits({ q: applied, list }),
      (e) => alive && setHits({ q: applied, list: [], error: e?.message ?? 'Search failed.' }),
    );
    return () => {
      alive = false;
    };
  }, [applied]);

  const picked = chip === 'speech' ? [] : PICKED.filter((p) => chip === 'all' || p.tags.includes(chip));
  const speech = (chip === 'all' || chip === 'speech') && Platform.OS !== 'web';
  const searching = !!applied.trim();

  return (
    <View style={{ gap: 16 }}>
      <DeviceCard />
      {!localEngineAvailable() ? <Banner tone="warn">{UNAVAILABLE}</Banner> : null}
      <SearchBar value={q} onChangeText={(t) => { setQ(t); if (!t.trim()) setApplied(''); }} placeholder="Search models on Hugging Face" onSubmit={() => setApplied(q.trim())} />
      {!searching ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {CHIPS.map((c) => <FilterChip key={c.id} label={c.label} on={chip === c.id} onPress={() => setChip(c.id)} />)}
        </ScrollView>
      ) : null}

      {searching ? (
        <View>
          <SectionTitle space={6}>{`Results for “${applied}”`}</SectionTitle>
          {hits?.q !== applied ? <PulseDots /> : null}
          {hits?.q === applied && hits.error ? <Text size={12.5} color="danger">{hits.error}</Text> : null}
          {hits?.q === applied && !hits.error && !hits.list.length ? <Text size={12.5} color="muted">Nothing found. Try another word.</Text> : null}
          {hits?.q === applied
            ? hits.list.map((h) => (
                <StoreRow key={h.id} name={prettyRepo(h.id)} desc={h.id} meta={`${count(h.downloads)} downloads`} pill={<Pill label="View" tone="plain" onPress={() => openModel({ repo: h.id })} />} onPress={() => openModel({ repo: h.id })} />
              ))
            : null}
        </View>
      ) : (
        <View>
          <SectionTitle space={6}>{`Recommended for this ${device}`}</SectionTitle>
          {picked.map((p) => (
            <StoreRow
              key={p.repo}
              name={p.name}
              desc={p.about}
              f={fit(p.size)}
              meta={`${quantOf(p.file)} · ${gb(p.size)}`}
              pill={<ModelPill repo={p.repo} file={p.file} size={p.size} name={p.name} />}
              onPress={() => openModel({ repo: p.repo, file: p.file, name: p.name })}
            />
          ))}
          {speech ? <PhononRow /> : null}
        </View>
      )}

      <Text size={12.5} color="muted" style={{ paddingHorizontal: 4, lineHeight: 19 }}>
        {`GGUF files from Hugging Face, run with llama.cpp on this ${device}. Sizes are the download; a model needs a little more than that in free memory while it runs.`}
      </Text>
    </View>
  );
}
