import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { Button, Card, Icon, ListRow, PulseDots, Screen, SectionTitle, Segmented, Text } from '@/components';
import * as haptic from '@/lib/haptics';
import { compact, loadSiteSkill, loadSkill, loadSkillFiles, recallSkill, siteSourceLabel, skillSourceLabel, type SkillFileData } from '@/lib/market';
import { parseSkillMd, slugify } from '@/lib/skills';
import { useLibrary, type Skill } from '@/store/library';
import { toast } from '@/store/toast';
import { useTheme } from '@/theme';

type Loaded = { key: string; md?: string; dir?: string; error?: string };
type Files = { key: string; list: SkillFileData[]; omitted: number };
const SCRIPT = /\.(py|sh|bash|zsh|js|mjs|cjs|ts|rb|php|pl|lua|go|rs|java|kt|swift|c|cpp|cs|sql|r)$/i;
const kb = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} kB` : `${n} B`);

const MODES: { value: Skill['mode']; label: string; sub: string }[] = [
  { value: 'auto', label: 'Automatic', sub: 'The assistant sees its name and description and opens it when a task matches. Costs almost nothing until used.' },
  { value: 'always', label: 'Always', sub: 'The whole text is added to every message. Best for short rules you always want.' },
  { value: 'onAsk', label: 'When I ask', sub: 'Only runs when you type its /command.' },
];

const PREVIEW_CHARS = 2500;

export default function MarketSkill() {
  const { colors } = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const listing = key ? recallSkill(key) : undefined;
  const skills = useLibrary((s) => s.skills);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<Skill['mode']>('auto');
  const [full, setFull] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [files, setFiles] = useState<Files | null>(null);
  const [withFiles, setWithFiles] = useState(true);

  useEffect(() => {
    if (!listing) return;
    let alive = true;
    const id = `${key}|${nonce}`;
    const fail = (e: any) => alive && setLoaded({ key: id, error: e?.message ?? 'Could not load the skill.' });
    if (listing.from === 'site') {
      // A website's skill comes with its files in one download.
      loadSiteSkill(listing).then((r) => {
        if (!alive) return;
        setLoaded({ key: id, md: r.md, dir: listing.dir });
        setFiles({ key: id, list: r.files, omitted: r.omitted });
      }, fail);
    } else {
      loadSkill(listing).then((r) => alive && setLoaded({ key: id, md: r.md, dir: r.dir }), fail);
    }
    return () => {
      alive = false;
    };
  }, [listing, key, nonce]);

  const data = loaded?.key === `${key}|${nonce}` ? loaded : null;
  const parsed = data?.md ? parseSkillMd(data.md) : null;

  // Once the instructions are in, fetch the files that sit next to them.
  const dirFound = data?.dir;
  const bodyFound = parsed?.body;
  useEffect(() => {
    if (!listing || listing.from === 'site' || dirFound === undefined || bodyFound === undefined) return;
    let alive = true;
    loadSkillFiles(listing.source, dirFound, bodyFound).then(
      (r) => alive && setFiles({ key: `${key}|${nonce}`, list: r.files, omitted: r.omitted }),
      () => alive && setFiles({ key: `${key}|${nonce}`, list: [], omitted: 0 }),
    );
    return () => {
      alive = false;
    };
  }, [listing, key, nonce, dirFound, bodyFound]);
  const fileData = files?.key === `${key}|${nonce}` ? files : null;
  const fileBytes = (fileData?.list ?? []).reduce((n, f) => n + f.size, 0);
  const hasScripts = (fileData?.list ?? []).some((f) => SCRIPT.test(f.path));

  if (!listing) {
    return (
      <Screen header={{ title: 'Skill' }}>
        <Text color="muted">Open this skill from the marketplace list.</Text>
        <Button label="Back to the marketplace" variant="outline" onPress={() => router.replace('/market')} />
      </Screen>
    );
  }

  const name = parsed?.name || listing.name;
  const description = parsed?.description || listing.description || '';
  const label = data?.dir === undefined ? '' : listing.from === 'site' ? siteSourceLabel(listing.source, data.dir) : skillSourceLabel(listing.source, data.dir);
  const existing = label ? skills.find((s) => s.source === label) : undefined;
  const changed = !!existing && !!parsed && existing.body !== parsed.body;
  // A skill added before files were supported, or whose files changed in size, can pick them up with an update.
  const newFiles = !!existing && !!fileData && fileData.list.length > 0 && existing.fileCount !== fileData.list.length;
  const body = parsed?.body ?? '';

  const add = async () => {
    if (!parsed) return;
    const id = await useLibrary.getState().saveSkill({
      id: existing?.id,
      name,
      description,
      version: parsed.meta.version || existing?.version || '1.0.0',
      source: label,
      body: parsed.body,
      mode: existing?.mode ?? mode,
      enabled: existing?.enabled ?? true,
    });
    if (fileData && (withFiles || existing)) await useLibrary.getState().saveSkillFiles(id, withFiles ? fileData.list.map((f) => ({ path: f.path, content: f.content })) : []);
    haptic.success();
    toast(existing ? `Updated ${name}` : `Added ${name}. Use it with /${slugify(name)}`);
    if (!existing) router.replace({ pathname: '/skill-detail', params: { id } });
  };

  return (
    <Screen
      header={{ title: name }}
      footer={
        data?.md ? (
          existing ? (
            <>
              {changed || newFiles ? <Button label={changed ? 'Update' : 'Add its files'} flex onPress={add} /> : null}
              <Button label="Open skill" variant={changed || newFiles ? 'outline' : 'primary'} flex onPress={() => router.replace({ pathname: '/skill-detail', params: { id: existing.id } })} />
            </>
          ) : (
            <Button label="Add skill" flex onPress={add} />
          )
        ) : undefined
      }>
      <View style={{ gap: 4 }}>
        <Text size={22} weight="semi">{name}</Text>
        <Text size={12.5} color="muted">{[listing.source, listing.installs ? `${compact(listing.installs)} installs` : '', listing.stars ? `★ ${compact(listing.stars)}` : ''].filter(Boolean).join(' · ')}</Text>
      </View>
      {description ? <Text color="text2" style={{ lineHeight: 22 }}>{description}</Text> : null}

      {!data && (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading the skill" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PulseDots />
          <Text color="muted" size={13.5}>{listing.from === 'site' ? `Downloading from ${listing.source}…` : 'Reading SKILL.md from GitHub…'}</Text>
        </View>
      )}
      {data?.error && (
        <View style={{ gap: 10 }}>
          <Text color="warn">{data.error}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Try again" variant="outline" height={40} onPress={() => setNonce((n) => n + 1)} />
            <Button label={listing.from === 'site' ? 'Open the website' : 'Open on GitHub'} variant="outline" height={40} onPress={() => Linking.openURL(listing.from === 'site' ? `https://${listing.source}` : `https://github.com/${listing.source}`)} />
          </View>
        </View>
      )}

      {data?.md && (
        <>
          <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
            <Icon name="warn" size={18} color={colors.warn} />
            <Text size={13} color="text2" style={{ flex: 1, lineHeight: 19 }}>
              Anyone can publish a skill, and its text steers how the assistant behaves. Read it before you add it. Scripts that come with a skill are only stored as text; they never run on your phone.
            </Text>
          </View>

          {!existing && (
            <View style={{ gap: 8 }}>
              <SectionTitle>How the assistant uses it</SectionTitle>
              <Segmented<Skill['mode']> options={MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={setMode} />
              <Text size={12.5} color="muted">{MODES.find((m) => m.value === mode)!.sub}</Text>
              {mode === 'always' && body.length > 8000 && <Text size={12.5} color="warn">This one is long ({compact(body.length)} characters). “Always” would add all of it to every message; “Automatic” is a better fit.</Text>}
            </View>
          )}
          {existing && (
            <Card>
              <ListRow icon="check" label="Already added" sub={changed ? 'The source has changed since you added it.' : newFiles ? 'Its files can be added or refreshed.' : 'Up to date with the source.'} last />
            </Card>
          )}

          <View>
            <SectionTitle>Instructions (SKILL.md)</SectionTitle>
            <Card style={{ padding: 14, gap: 10 }}>
              <Text mono size={12.5} color="text2" selectable>{full || body.length <= PREVIEW_CHARS ? body : `${body.slice(0, PREVIEW_CHARS).trimEnd()}…`}</Text>
              {body.length > PREVIEW_CHARS && (
                <Button label={full ? 'Show less' : `Show all ${body.length.toLocaleString()} characters`} variant="outline" height={38} onPress={() => setFull((f) => !f)} />
              )}
            </Card>
          </View>

          {!fileData && <Text size={12.5} color="muted">Looking for its other files…</Text>}
          {fileData && fileData.list.length > 0 && (
            <View>
              <SectionTitle>{`Files that come with it · ${fileData.list.length}`}</SectionTitle>
              <Card>
                {fileData.list.slice(0, 8).map((f) => <ListRow key={f.path} mono label={f.path} sub={SCRIPT.test(f.path) ? 'Script: read only, never run' : undefined} value={kb(f.size)} />)}
                {fileData.list.length > 8 && <ListRow label={`and ${fileData.list.length - 8} more`} value={kb(fileBytes)} />}
                {!existing && <ListRow label="Add these files too" sub={`${kb(fileBytes)} of text${fileData.omitted ? `; ${fileData.omitted} more were left out` : ''}`} toggle={{ on: withFiles, onChange: setWithFiles }} last />}
              </Card>
              <Text size={12.5} color="muted" style={{ marginTop: 8, paddingLeft: 4, lineHeight: 18 }}>
                The assistant opens these when the instructions point to them.{hasScripts ? ' Scripts are kept as text and AI Hat never runs them; with a code-running tool connected (an MCP server), the assistant can pass them to it.' : ''}
              </Text>
            </View>
          )}

          <Card>
            <ListRow label="Source" value={label.replace('github.com/', '')} onPress={() => Linking.openURL(listing.from === 'site' ? `https://${listing.source}` : `https://github.com/${listing.source}/tree/HEAD/${data.dir ?? ''}`)} />
            <ListRow label="Size" value={`${body.length.toLocaleString()} characters`} last={!parsed?.meta.license} />
            {parsed?.meta.license ? <ListRow label="License" value={parsed.meta.license} last /> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}
