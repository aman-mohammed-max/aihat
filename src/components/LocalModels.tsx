import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { device } from '@/lib/device';
import { useLayout } from '@/lib/layout';
import { gb, PICKED, prettyRepo, quantOf, repoFiles, repoUrl, searchRepos, type GgufFile, type RepoHit } from '@/lib/local/catalog';
import { localEngineAvailable, UNAVAILABLE } from '@/lib/local/engine';
import { modelId } from '@/lib/local/files';
import { fit, fitLabel, thisDevice, type Fit } from '@/lib/local/fit';
import { isLocalProvider } from '@/lib/local/provider';
import { useLocalModels } from '@/store/localModels';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { useTheme } from '@/theme';

import { openChat } from './AppNav';
import { Banner, Button, SectionTitle } from './Controls';
import { Icon } from './Icon';
import { PulseDots } from './Motion';
import { SearchBar } from './SearchBar';
import { Text } from './Text';

const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

function FitLine({ size }: { size: number }) {
  const { colors } = useTheme();
  const f: Fit = fit(size);
  const dot = f === 'good' ? colors.accent : f === 'ok' ? colors.warn : f === 'no' ? colors.danger : colors.faint;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
      <Text size={12} color={f === 'no' ? 'danger' : 'muted'} numberOfLines={2} style={{ flex: 1 }}>{fitLabel(f, size)}</Text>
    </View>
  );
}

function Progress({ written, size }: { written: number; size: number }) {
  const { colors } = useTheme();
  const pct = size ? Math.min(100, Math.round((written / size) * 100)) : 0;
  return (
    <View style={{ gap: 5 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 4, backgroundColor: colors.accent }} />
      </View>
      <Text size={11.5} color="muted">{size ? `${gb(written)} of ${gb(size)} · ${pct}%` : gb(written)}</Text>
    </View>
  );
}

/** Make a downloaded model the one new chats use, and open a new chat. */
function startChatWith(id: string, name: string) {
  const p = useProviders.getState().providers.find(isLocalProvider);
  if (!p) return;
  useSettings.getState().set({ defaultProviderId: p.id, defaultModelId: id });
  toast(`New chats use ${name}`);
  openChat('/');
}

/** Download, pause, resume, use: what fits the model's state. */
function Actions({ repo, file, size, name }: { repo: string; file: string; size: number; name?: string }) {
  const id = modelId(repo, file);
  const store = useLocalModels();
  const job = store.jobs[id];
  const have = store.models.find((m) => m.id === id);
  const available = localEngineAvailable();

  if (have) return <Button label="Use in a new chat" height={38} textSize={13.5} onPress={() => startChatWith(id, have.name)} />;
  if (job) {
    return (
      <View style={{ gap: 8 }}>
        {job.state === 'failed' ? <Text size={12} color="danger">{job.error}</Text> : <Progress written={job.written} size={job.size} />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {job.state === 'active' ? <Button label="Pause" variant="outline" height={36} textSize={13} onPress={() => store.pause(id)} /> : null}
          {job.state === 'paused' ? <Button label="Resume" height={36} textSize={13} onPress={() => void store.resume(id)} /> : null}
          {job.state === 'failed' ? <Button label="Try again" height={36} textSize={13} onPress={() => void store.resume(id)} /> : null}
          <Button label="Cancel" variant="outline" height={36} textSize={13} onPress={() => store.cancel(id)} />
        </View>
      </View>
    );
  }
  const start = () => store.download({ repo, file, size, name }).catch((e: Error) => Alert.alert('Couldn’t download', e.message));
  const go = () =>
    fit(size) === 'no'
      ? Alert.alert('This model is too big for this device', `It needs more memory than this ${device} can give one app, so it may not load or the app may close. Download it anyway?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Download anyway', onPress: start },
        ])
      : start();
  return <Button label={`Download · ${gb(size)}`} variant={fit(size) === 'no' ? 'outline' : 'primary'} height={38} textSize={13.5} disabled={!available || !size} onPress={go} />;
}

function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { wide } = useLayout();
  return <View style={{ flexBasis: wide ? 320 : '100%', flexGrow: 1, padding: 14, gap: 10, borderRadius: 16, backgroundColor: colors.surface }}>{children}</View>;
}

/** One repository from a search: tap to see its model files, each with its size and whether it fits. */
function RepoRow({ hit }: { hit: RepoHit }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<GgufFile[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || files) return;
    let alive = true;
    repoFiles(hit.id).then(
      (f) => alive && setFiles(f),
      (e) => alive && setError(e?.message ?? 'Couldn’t read this repository.'),
    );
    return () => {
      alive = false;
    };
  }, [open, files, hit.id]);
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text size={15} weight="medium" numberOfLines={1}>{prettyRepo(hit.id)}</Text>
          <Text size={12} color="muted" numberOfLines={1}>{`${hit.id.split('/')[0]} · ${count(hit.downloads)} downloads`}</Text>
        </View>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} color={colors.faint} />
      </Pressable>
      {open && !files && !error ? <PulseDots /> : null}
      {error ? <Text size={12.5} color="danger">{error}</Text> : null}
      {files && !files.length ? <Text size={12.5} color="muted">No single-file models here that this app can load.</Text> : null}
      {files?.map((f) => (
        <View key={f.path} style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text mono size={12.5} style={{ flex: 1 }} numberOfLines={1}>{quantOf(f.path) || f.path}</Text>
            <Text size={12} color="muted">{gb(f.size)}</Text>
          </View>
          <FitLine size={f.size} />
          <Actions repo={hit.id} file={f.path} size={f.size} name={prettyRepo(hit.id)} />
        </View>
      ))}
      {open ? <Pressable accessibilityRole="link" onPress={() => Linking.openURL(repoUrl(hit.id))}><Text size={12} color="accent">Open on Hugging Face</Text></Pressable> : null}
    </Card>
  );
}

/** Marketplace › Local models: chat models that run on this phone or tablet, without an endpoint. */
export function LocalModelsTab() {
  const { colors } = useTheme();
  const me = thisDevice();
  const { models, jobs } = useLocalModels();
  const remove = useLocalModels((s) => s.remove);
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
  const searching = !!applied.trim() && hits?.q !== applied;
  const running = Object.values(jobs).filter((j) => !models.some((m) => m.id === j.id));

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.surface }}>
        <Icon name="chip" size={20} color={colors.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text size={14} weight="medium">{me.memory ? `${me.name} · ${gb(me.memory)} memory` : me.name}</Text>
          <Text size={12.5} color="muted">{`Models here run on this ${device}: they work offline, and nothing you type leaves it.`}</Text>
        </View>
      </View>
      {!localEngineAvailable() ? <Banner tone="warn">{UNAVAILABLE}</Banner> : null}

      {models.length || running.length ? (
        <View style={{ gap: 8 }}>
          <SectionTitle>{`On this ${device}`}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {running.map((j) => (
              <Card key={j.id}>
                <Text size={15} weight="medium" numberOfLines={1}>{j.name}</Text>
                <Actions repo={j.repo} file={j.file} size={j.size} />
              </Card>
            ))}
            {models.map((m) => (
              <Card key={m.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text size={15} weight="medium" numberOfLines={1} style={{ flex: 1 }}>{m.name}</Text>
                  <Text size={12} color="muted">{gb(m.size)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Actions repo={m.id.split('/').slice(0, 2).join('/')} file={m.id.split('/').slice(2).join('/')} size={m.size} />
                  </View>
                  <Button
                    label="Delete"
                    variant="danger"
                    height={38}
                    textSize={13.5}
                    onPress={() =>
                      Alert.alert(`Delete ${m.name}?`, `It frees ${gb(m.size)}. You can download it again later.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => void remove(m.id) },
                      ])
                    }
                  />
                </View>
              </Card>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionTitle>{`Picked for this ${device}`}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {PICKED.map((p) => (
            <Card key={p.repo}>
              <View style={{ gap: 2 }}>
                <Text size={15} weight="medium">{p.name}</Text>
                <Text size={12} color="muted">{`${p.maker} · ${gb(p.size)} · ${quantOf(p.file)}`}</Text>
              </View>
              <Text size={13} color="text2" style={{ lineHeight: 19 }}>{p.about}</Text>
              <FitLine size={p.size} />
              <Actions repo={p.repo} file={p.file} size={p.size} name={p.name} />
            </Card>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>Any model on Hugging Face</SectionTitle>
        <SearchBar value={q} onChangeText={setQ} placeholder="Search GGUF models, e.g. qwen, gemma, llama" onSubmit={() => setApplied(q)} />
        {searching ? <PulseDots /> : null}
        {hits?.q === applied && hits.error ? <Text size={12.5} color="danger">{hits.error}</Text> : null}
        {hits?.q === applied && !hits.error && !hits.list.length ? <Text size={12.5} color="muted">{`Nothing found for “${applied}”.`}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {hits?.q === applied ? hits.list.map((h) => <RepoRow key={h.id} hit={h} />) : null}
        </View>
      </View>
    </View>
  );
}
