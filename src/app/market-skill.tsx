import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { Banner, Button, Icon, InfoBox, Note, Panel, PanelRow, PulseDots, Screen, SectionTitle, Segmented, Text } from '@/components';
import { device } from '@/lib/device';
import * as haptic from '@/lib/haptics';
import { compact, loadSiteSkill, loadSkill, loadSkillFiles, recallSkill, siteSourceLabel, skillSourceLabel, type SkillFileData } from '@/lib/market';
import { fileSize, parseSkillMd, SCRIPT_FILE, slugify } from '@/lib/skills';
import { useLibrary, type Skill } from '@/store/library';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { useTheme } from '@/theme';

type Loaded = { key: string; md?: string; dir?: string; error?: string };
type Files = { key: string; list: SkillFileData[]; omitted: number };

const MODES: { value: Skill['mode']; label: string; sub: string }[] = [
  { value: 'auto', label: 'Automatic', sub: 'The assistant sees its name and description and opens it when a task matches. Costs almost nothing until used.' },
  { value: 'always', label: 'Always', sub: 'The whole text is added to every message. Best for short rules you always want.' },
  { value: 'onAsk', label: 'When I ask', sub: 'Only runs when you type its /command.' },
];

const PREVIEW_CHARS = 2500;

export default function MarketSkill() {
  const { colors } = useTheme();
  const scriptsOn = useSettings((s) => s.skillScripts);
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
  const hasScripts = (fileData?.list ?? []).some((f) => SCRIPT_FILE.test(f.path));

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
      autoUpdate: existing?.autoUpdate,
    });
    if (fileData && (withFiles || existing)) await useLibrary.getState().saveSkillFiles(id, withFiles ? fileData.list.map((f) => ({ path: f.path, content: f.content })) : []);
    haptic.success();
    toast(existing ? `Updated ${name}` : `Added ${name}. Use it with /${slugify(name)}`);
    if (!existing) router.replace({ pathname: '/skill-detail', params: { id } });
  };

  const shown = fileData?.list.slice(0, 3) ?? [];
  const rest = fileData?.list.slice(3) ?? [];

  return (
    <Screen
      header={{ title: name }}
      footer={
        data?.md ? (
          existing ? (
            <>
              {changed || newFiles ? <Button label={changed ? 'Update' : 'Add its files'} height={48} flex onPress={add} /> : null}
              <Button label="Open skill" height={48} variant={changed || newFiles ? 'outline' : 'primary'} flex onPress={() => router.replace({ pathname: '/skill-detail', params: { id: existing.id } })} />
            </>
          ) : (
            <Button label="Add skill" height={48} flex onPress={add} />
          )
        ) : undefined
      }>
      <View style={{ gap: 4 }}>
        <Text size={22} weight="semi">{name}</Text>
        <Text size={12.5} color="muted">{[listing.source, listing.installs ? `${compact(listing.installs)} installs` : '', listing.stars ? `★ ${compact(listing.stars)}` : ''].filter(Boolean).join(' · ')}</Text>
      </View>
      {description ? <Text size={15} color="text2" style={{ lineHeight: 22.5 }}>{description}</Text> : null}

      {!data && (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading the skill" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PulseDots />
          <Text color="muted" size={13.5}>{listing.from === 'site' ? `Downloading from ${listing.source}…` : 'Reading SKILL.md from GitHub…'}</Text>
        </View>
      )}
      {data?.error && (
        <View style={{ gap: 10 }}>
          <Banner tone="danger">{data.error}</Banner>
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
            <Text size={13} color="text2" style={{ flex: 1, lineHeight: 19.5 }}>
              {`Anyone can publish a skill, and its text steers how the assistant behaves. Read it before you add it. ${scriptsOn ? `Scripts that come with a skill can run in the sandbox on your ${device}, after you allow each run.` : `Scripts that come with a skill only run if you turn on Run skill scripts (Skills page).`}`}
            </Text>
          </View>

          {!existing && (
            <View style={{ gap: 8 }}>
              <SectionTitle space={0}>How the assistant uses it</SectionTitle>
              <Segmented<Skill['mode']> options={MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={setMode} />
              <Note>{MODES.find((m) => m.value === mode)!.sub}</Note>
              {mode === 'always' && body.length > 8000 && <Note color="warn">{`This one is long (${compact(body.length)} characters). “Always” would add all of it to every message; “Automatic” is a better fit.`}</Note>}
            </View>
          )}
          {existing && (
            <InfoBox
              icon="check"
              tone="accent"
              title="Added"
              sub={changed ? 'The source has changed since you added it. Update to get the new version.' : newFiles ? 'Its files can be added or refreshed.' : `Use it with /${slugify(name)}, or let the assistant open it when a task matches.`}
            />
          )}

          {!fileData && <Note>Looking for its other files…</Note>}
          {fileData && fileData.list.length > 0 && (
            <View>
              <SectionTitle space={8}>{`Files that come with it · ${fileData.list.length}`}</SectionTitle>
              <Panel>
                {shown.map((f) => <PanelRow key={f.path} mono label={f.path} sub={SCRIPT_FILE.test(f.path) ? (scriptsOn ? 'Script: can run in the sandbox' : 'Script: kept as text') : undefined} value={fileSize(f.size)} />)}
                {rest.length > 0 && <PanelRow label={`and ${rest.length} more`} value={fileSize(rest.reduce((n, f) => n + f.size, 0))} />}
                {!existing && <PanelRow label="Add these files too" sub={`${fileSize(fileBytes)} of text${fileData.omitted ? `; ${fileData.omitted} more were left out` : ''}`} height={56} toggle={{ on: withFiles, onChange: setWithFiles }} />}
              </Panel>
              <Text size={12.5} color="muted" style={{ marginTop: 8, paddingHorizontal: 4, lineHeight: 19 }}>
                {`The assistant opens these when the instructions point to them.${hasScripts ? (scriptsOn ? ' The assistant can run its scripts in the sandbox, asking you first.' : ' Its scripts are kept as text unless you turn on Run skill scripts.') : ''}`}
              </Text>
            </View>
          )}

          <View>
            <SectionTitle space={8}>Instructions (SKILL.md)</SectionTitle>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 }}>
              <Text mono size={12.5} color="text2" selectable style={{ lineHeight: 19.4 }}>{full || body.length <= PREVIEW_CHARS ? body : `${body.slice(0, PREVIEW_CHARS).trimEnd()}…`}</Text>
              {body.length > PREVIEW_CHARS && (
                <Button label={full ? 'Show less' : `Show all ${body.length.toLocaleString('en-US')} characters`} variant="outline" height={40} onPress={() => setFull((f) => !f)} />
              )}
            </View>
          </View>

          <Panel>
            <PanelRow label="Source" value={label.replace('github.com/', '')} onPress={() => Linking.openURL(listing.from === 'site' ? `https://${listing.source}` : `https://github.com/${listing.source}/tree/HEAD/${data.dir ?? ''}`)} />
            <PanelRow label="Size" value={`${body.length.toLocaleString('en-US')} characters`} />
            {parsed?.meta.license ? <PanelRow label="License" value={parsed.meta.license} /> : null}
          </Panel>
        </>
      )}
    </Screen>
  );
}
