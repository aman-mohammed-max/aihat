import { Paths } from 'expo-file-system';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { Banner, Button, Icon, PulseDots, Screen, SectionTitle, Text } from '@/components';
import { startChatWith, useFitColor } from '@/components/LocalModels';
import { device } from '@/lib/device';
import { gb, PICKED, prettyRepo, quantNote, quantOf, repoDescription, repoFiles, repoInfo, repoUrl, type GgufFile, type RepoInfo } from '@/lib/local/catalog';
import { localEngineAvailable, UNAVAILABLE } from '@/lib/local/engine';
import { modelId } from '@/lib/local/files';
import { fit, needs, thisDevice } from '@/lib/local/fit';
import { useLocalInference } from '@/store/localInference';
import { useLocalModels } from '@/store/localModels';
import { useTheme } from '@/theme';

/** One model from the marketplace: what it is, whether it fits here, which version to get, and its download. */
export default function MarketModel() {
  const params = useLocalSearchParams<{ repo?: string; file?: string; name?: string }>();
  const repo = typeof params.repo === 'string' ? params.repo : '';
  const file = typeof params.file === 'string' ? params.file : undefined;
  const name = typeof params.name === 'string' ? params.name : undefined;
  const { colors } = useTheme();
  const fitColor = useFitColor();
  const picked = PICKED.find((p) => p.repo === repo);
  const title = name || picked?.name || (repo ? prettyRepo(repo) : 'Model details');
  const [filesResult, setFilesResult] = useState<{ repo: string; files: GgufFile[] } | null>(null);
  const [infoResult, setInfoResult] = useState<{ repo: string; info: RepoInfo } | null>(null);
  const [descriptionResult, setDescriptionResult] = useState<{ repo: string; text?: string } | null>(null);
  const [errorResult, setErrorResult] = useState<{ repo: string; message: string } | null>(null);
  const [sel, setSel] = useState<string | null>(file ?? picked?.file ?? null);
  const store = useLocalModels();
  const inference = useLocalInference();

  useEffect(() => {
    let alive = true;
    void (async () => {
      let revision = 'main';
      try {
        const info = await repoInfo(repo);
        revision = info.revision ?? revision;
        if (alive) setInfoResult({ repo, info });
      } catch {
        // File discovery can still succeed on the main branch when optional model metadata is unavailable.
      }
      void repoDescription(repo, revision).then(
        (text) => alive && setDescriptionResult({ repo, text }),
        () => alive && setDescriptionResult({ repo }),
      );
      try {
        const found = await repoFiles(repo, revision);
        if (alive) setFilesResult({ repo, files: found });
      } catch (e: any) {
        if (alive) setErrorResult({ repo, message: e?.message ?? 'Couldn’t read this model’s files.' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [repo]);

  const files = filesResult?.repo === repo ? filesResult.files : null;
  const error = errorResult?.repo === repo ? errorResult.message : '';
  const chosen = files?.find((f) => f.path === sel) ?? files?.find((f) => quantOf(f.path) === 'Q4_K_M') ?? files?.[0];
  const size = chosen?.size ?? picked?.size ?? 0;
  const id = chosen ? modelId(repo, chosen.path) : null;
  const have = id ? store.models.find((m) => m.id === id) : undefined;
  const job = id ? store.jobs[id] : undefined;
  const info = infoResult?.repo === repo ? infoResult.info : undefined;
  const description = picked?.about ?? (descriptionResult?.repo === repo ? descriptionResult.text : undefined);
  const me = thisDevice();
  const f = fit(size);
  const free = Paths.availableDiskSpace || 0;
  const fitTitle = f === 'good' ? `Runs well on this ${device}` : f === 'ok' ? `Tight on this ${device}` : f === 'no' ? `Too big for this ${device}` : 'Size not known yet';
  const fitNote = size
    ? `Needs about ${gb(needs(size))} of memory while it runs. This ${device} has ${gb(me.memory)}${free ? ` and ${gb(free)} of free storage` : ''}.${f === 'ok' ? ' It will run slowly and warm.' : ''}`
    : 'Reading the model’s files…';
  const pct = job?.size ? Math.min(100, Math.round((job.written / job.size) * 100)) : 0;
  const parameterCount = info?.parameters
    ? info.parameters >= 1e9 ? `${(info.parameters / 1e9).toFixed(1)}B` : `${(info.parameters / 1e6).toFixed(0)}M`
    : 'Not reported by publisher';
  const sourceUrl = (() => { try { return repoUrl(repo); } catch { return null; } })();
  const updateAvailable = !!(have && chosen?.revision && have.revision !== chosen.revision);
  const isRemoving = !!id && inference.removing.includes(id);
  const runtimeLabel = have && inference.modelId === have.id
    ? inference.phase === 'loaded' ? 'Loaded in memory' : inference.phase === 'loading' ? 'Loading model' : inference.phase === 'error' ? 'Model load failed' : ''
    : '';

  const download = () => {
    if (!chosen) return;
    const start = () => store.download({ repo, file: chosen.path, size: chosen.size, name: title, sha256: chosen.sha256, revision: chosen.revision }).catch((e: Error) => Alert.alert('Couldn’t download', e.message));
    if (f === 'no') {
      Alert.alert('This version is too big for this device', `It needs more memory than this ${device} can give one app, so it may not load or the app may close. Download it anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download anyway', onPress: start },
      ]);
    } else start();
  };

  const jobControls = job ? (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text size={13}>{job.state === 'queued' ? 'Queued · waiting for a download slot' : job.state === 'failed' ? 'The update stopped' : job.state === 'paused' ? `Paused · ${pct}%` : `Updating · ${pct}%`}</Text>
        <Text size={13} color="muted">{`${gb(job.written)} of ${gb(job.size)}`}</Text>
      </View>
      {job.state === 'verifying' ? <Text size={12.5} color="muted">Checking file size, GGUF format, and publisher checksum…</Text> : null}
      {job.state === 'installing' ? <Text size={12.5} color="muted">Committing the verified model safely…</Text> : null}
      {job.state === 'failed' ? <Text size={12.5} color="danger">{job.error}</Text> : null}
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 6, backgroundColor: colors.accent }} />
      </View>
      {job.state === 'queued' ? (
        <Button label="Cancel queued download" variant="danger" flex height={44} onPress={() => store.cancel(job.id)} />
      ) : job.state === 'active' || job.state === 'paused' || job.state === 'failed' ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button label={job.state === 'active' ? 'Pause' : job.state === 'paused' ? 'Resume' : 'Try again'} variant="outline" flex height={44} onPress={() => (job.state === 'active' ? store.pause(job.id) : void store.resume(job.id))} />
          <Button label="Cancel" variant="danger" flex height={44} onPress={() => store.cancel(job.id)} />
        </View>
      ) : null}
    </View>
  ) : null;

  const footer = !localEngineAvailable() ? undefined : have ? (
    <View style={{ flex: 1, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="check" size={17} color={colors.accent} strokeWidth={2.2} />
        <Text size={13.5} color="text2" style={{ flex: 1 }}>{`Downloaded · in the model picker under On this ${device}`}</Text>
      </View>
      {runtimeLabel ? <Text size={12.5} color={inference.phase === 'error' ? 'danger' : 'muted'}>{runtimeLabel}{inference.phase === 'error' && inference.error ? ` · ${inference.error}` : ''}</Text> : null}
      {isRemoving ? <Button label="Removing model…" height={48} disabled /> : updateAvailable ? jobControls ?? <Button label={`Update · ${gb(size)}`} height={48} onPress={download} /> : <Button label="Start a chat with it" height={48} onPress={() => startChatWith(have.id, have.name)} />}
    </View>
  ) : job ? jobControls : (
    <Button label={size ? `Download ${gb(size)}` : 'Download'} flex height={48} disabled={!chosen} onPress={download} />
  );

  return (
    <Screen header={{ title }} gap={18} footer={footer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Text size={22} weight="semi">{(title.trim()[0] ?? '?').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text size={22} weight="semi">{title}</Text>
          <Text size={12.5} color="muted">{[repo.split('/')[0], info?.license ?? picked?.license, 'from Hugging Face'].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[...(picked?.tags.includes('chat') || !picked ? ['Chat'] : []), ...(picked?.tags.includes('reasoning') ? ['Thinking mode'] : []), 'Works offline', 'Text only'].map((t) => (
          <View key={t} style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }}>
            <Text size={12.5} color="text2">{t}</Text>
          </View>
        ))}
      </View>

      {!localEngineAvailable() ? <Banner tone="warn">{UNAVAILABLE}</Banner> : null}

      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: 16, padding: 14 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: fitColor(f) }} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text size={15} weight="medium">{fitTitle}</Text>
          <Text size={12.5} color="muted" style={{ lineHeight: 18 }}>{fitNote}</Text>
        </View>
      </View>

      <Text size={14.5} color="text2" style={{ lineHeight: 22 }}>{description ?? (descriptionResult?.repo === repo ? 'No short description was found in the publisher’s model card.' : 'Loading model description…')}</Text>

      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Version · smaller downloads lose a little quality</SectionTitle>
        {error ? <Text size={12.5} color="danger">{error}</Text> : null}
        {!files && !error ? <PulseDots /> : null}
        {files && !files.length ? <Text size={12.5} color="muted">No single-file versions here that this app can load.</Text> : null}
        {files?.length ? (
          <View accessibilityRole="radiogroup" style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>
            {files.map((v, i) => {
              const on = v.path === chosen?.path;
              const q = quantOf(v.path) || v.path;
              const vf = fit(v.size);
              return (
                <Pressable
                  key={v.path}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setSel(v.path)}
                  style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: i < files.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: on ? 5 : 2, borderColor: on ? colors.accent : colors.border }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text mono size={13.5}>{q}</Text>
                    <Text size={12} color={vf === 'no' ? 'danger' : 'muted'}>{vf === 'no' ? `Too big for this ${device}` : quantNote(q) || v.path}</Text>
                  </View>
                  <Text size={13} color="text2">{gb(v.size)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={15} style={{ flex: 1 }}>Architecture</Text>
          <Text size={13} color="muted">{info?.architecture ?? 'Not reported by publisher'}</Text>
        </View>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={15} style={{ flex: 1 }}>Parameters</Text>
          <Text size={13} color="muted">{parameterCount}</Text>
        </View>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={15} style={{ flex: 1 }}>Format · engine</Text>
          <Text size={13} color="muted">GGUF · llama.cpp</Text>
        </View>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={15} style={{ flex: 1 }}>App targets</Text>
          <Text size={13} color="muted">iOS arm64 · Android arm64/x86_64</Text>
        </View>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={15} style={{ flex: 1 }}>Hardware</Text>
          <Text size={13} color="muted">CPU · optional iOS Metal</Text>
        </View>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={15} style={{ flex: 1 }}>Install status</Text>
          <Text size={13} color="muted">{have ? 'Ready' : job ? job.state : 'Available'}</Text>
        </View>
        {info?.revision ? <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={15} style={{ flex: 1 }}>Publisher revision</Text>
          <Text mono size={12} color="muted">{info.revision.slice(0, 12)}</Text>
        </View> : null}
        {sourceUrl ? <Pressable accessibilityRole="link" onPress={() => Linking.openURL(sourceUrl)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={15} style={{ flex: 1 }}>Files</Text>
          <Text mono size={12} color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>{repo}</Text>
        </Pressable> : null}
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }}>
          <Text size={15} style={{ flex: 1 }}>Runs with</Text>
          <Text size={13} color="muted">{`llama.cpp on this ${device}`}</Text>
        </View>
      </View>
      <Text size={12} color="muted" style={{ lineHeight: 18 }}>
        GGUF format and an adequate memory estimate do not guarantee that this model’s architecture is supported by the installed engine version.
      </Text>
    </Screen>
  );
}
