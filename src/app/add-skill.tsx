import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Banner, Button, Field, ListRow, PulseDots, Screen, Segmented, Text } from '@/components';
import { readBytes } from '@/lib/files';
import { loadSkillFiles, parseGithubRef, repoSkills, skillFromFiles, skillMdAt, skillSourceLabel, unpack, type SkillFileData } from '@/lib/market';
import { fileSize, parseSkillMd, SCRIPT_FILE } from '@/lib/skills';
import { useLibrary } from '@/store/library';
import { fonts, radii, useTheme } from '@/theme';

type Mode = 'git' | 'zip' | 'write';
/** A skill read from a link or a file, waiting to be added. */
type Found = { md: string; files: SkillFileData[]; source: string; fromGit: boolean };

/** Read the skill a GitHub link points to: a folder with a SKILL.md, or a repository with one skill. */
async function fromGit(url: string): Promise<Found> {
  const ref = parseGithubRef(url);
  if (!ref) throw new Error('Use a github.com link to a repository or to a folder in one.');
  const source = `${ref.owner}/${ref.repo}`;
  let dir = ref.path;
  let md = await skillMdAt(source, dir, ref.ref);
  if (!md && !dir) {
    const all = await repoSkills(ref);
    if (all.length > 1) throw new Error(`This repository has ${all.length} skills. Paste the link to one skill’s folder, or find it in Browse skills.`);
    dir = all[0]?.dir ?? '';
    md = all[0] ? await skillMdAt(source, dir, ref.ref) : null;
  }
  if (!md) throw new Error('There is no SKILL.md at the top of that folder.');
  const { files } = await loadSkillFiles(source, dir, parseSkillMd(md).body).catch(() => ({ files: [] as SkillFileData[] }));
  return { md, files, source: skillSourceLabel(source, dir), fromGit: true };
}

/** Read a skill from a picked file: a .zip (or .tar.gz) of its folder, or a single SKILL.md. */
async function fromFile(): Promise<Found | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/gzip', 'application/x-tar', 'text/markdown', 'text/plain', '*/*'] });
  if (res.canceled) return null;
  const file = res.assets[0];
  const bytes = await readBytes(file.uri);
  if (/\.(md|markdown|txt)$/i.test(file.name)) return { md: new TextDecoder().decode(bytes), files: [], source: 'local', fromGit: false };
  const { md, files } = skillFromFiles(unpack(bytes));
  return { md, files, source: 'local', fromGit: false };
}

export default function AddSkill() {
  const { colors, body } = useTheme();
  const [mode, setMode] = useState<Mode>('git');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [text, setText] = useState('');
  const [enable, setEnable] = useState(true);
  const [follow, setFollow] = useState(false);
  // What a link turned out to hold, kept with the link it was for: typing a new one shows "reading" without clearing state here.
  const [lookup, setLookup] = useState<{ url: string; found?: Found; error?: string } | null>(null);
  const [picked, setPicked] = useState<{ found?: Found; error?: string } | null>(null);
  const [picking, setPicking] = useState(false);

  // Look the link up a moment after typing stops.
  useEffect(() => {
    if (mode !== 'git' || !parseGithubRef(url)) return;
    let alive = true;
    const t = setTimeout(() => {
      fromGit(url).then(
        (f) => alive && setLookup({ url, found: f }),
        (e) => alive && setLookup({ url, error: e.message }),
      );
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [url, mode]);

  const result = mode === 'git' ? (lookup?.url === url ? lookup : null) : mode === 'zip' ? picked : null;
  const found = result?.found ?? null;
  const error = result?.error ?? '';
  const busy = mode === 'git' ? !!parseGithubRef(url) && lookup?.url !== url : mode === 'zip' && picking;

  const pick = async () => {
    setPicking(true);
    try {
      const f = await fromFile();
      if (f) setPicked({ found: f });
    } catch (e: any) {
      setPicked({ error: e.message });
    } finally {
      setPicking(false);
    }
  };

  const parsed = found ? parseSkillMd(found.md) : null;
  const ready = mode === 'write' ? !!name.trim() && !!text.trim() : !!parsed;
  const add = async () => {
    if (!ready) return;
    const p = mode === 'write' ? { name: name.trim(), description: desc.trim(), body: text.trim(), meta: {} as Record<string, string> } : parsed!;
    const skillName = (p.name ?? '').trim() || 'untitled-skill';
    const id = await useLibrary.getState().saveSkill({
      name: skillName,
      description: p.description ?? '',
      body: p.body,
      version: p.meta.version || '1.0.0',
      source: found?.source ?? 'local',
      enabled: enable,
      autoUpdate: !!found?.fromGit && follow,
    });
    if (found?.files.length) await useLibrary.getState().saveSkillFiles(id, found.files.map((f) => ({ path: f.path, content: f.content })));
    router.replace({ pathname: '/skill-detail', params: { id } });
  };

  const size = found ? found.md.length + found.files.reduce((n, f) => n + f.size, 0) : 0;
  const scripts = found ? found.files.filter((f) => SCRIPT_FILE.test(f.path)).length : 0;

  return (
    <Screen
      header={{ left: 'cancel', title: 'Add skill', right: 'text', rightText: 'Add', onRightText: add }}
      gap={18}
      footer={<Button label="Add skill" height={48} flex disabled={!ready} onPress={add} />}>
      <Segmented<Mode> options={[{ value: 'git', label: 'Git URL' }, { value: 'zip', label: 'Upload .zip' }, { value: 'write', label: 'Write new' }]} value={mode} onChange={setMode} />
      {mode === 'git' && <Field label="Repository or folder URL" value={url} onChangeText={setUrl} mono keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="github.com/you/skills/tree/main/commit-writer" hint="Must contain a SKILL.md at the top." />}
      {mode === 'zip' && (
        <Pressable accessibilityRole="button" onPress={pick} style={({ pressed }) => ({ minHeight: 96, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 16, opacity: pressed ? 0.7 : 1 })}>
          <Text size={15} weight="medium">{found ? 'Choose another file' : 'Choose a file'}</Text>
          <Text size={12.5} color="muted" style={{ textAlign: 'center' }}>A .zip of the skill’s folder, or a single SKILL.md</Text>
        </Pressable>
      )}
      {mode === 'write' && (
        <>
          <Field label="Name" value={name} onChangeText={setName} mono autoCapitalize="none" autoCorrect={false} placeholder="commit-writer" />
          <Field label="What it does" value={desc} onChangeText={setDesc} autoCapitalize="sentences" placeholder="Writes commit messages from a diff" hint="The assistant reads this to decide when to use the skill." />
          <View style={{ gap: 6 }}>
            <Text size={12} weight="medium" color="muted" style={{ paddingLeft: 4 }}>Instructions</Text>
            <TextInput accessibilityLabel="Instructions" value={text} onChangeText={setText} multiline textAlignVertical="top" placeholderTextColor={colors.faint} placeholder="When asked for a commit message…" style={{ minHeight: 180, borderRadius: radii.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.field, padding: 12, color: colors.text, fontFamily: fonts.mono, fontSize: body - 1.5, lineHeight: (body - 1.5) * 1.5 }} />
          </View>
        </>
      )}
      {busy && (
        <View accessibilityRole="progressbar" accessibilityLabel="Reading the skill" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
          <PulseDots />
          <Text size={13} color="muted">{mode === 'git' ? 'Reading SKILL.md from GitHub…' : 'Reading the file…'}</Text>
        </View>
      )}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {parsed && found && mode !== 'write' && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} />
            <Text size={12.5} color="muted">Found a skill</Text>
          </View>
          <Text mono size={15}>{parsed.name || 'untitled-skill'}</Text>
          {parsed.description ? <Text size={13.5} color="text2" style={{ lineHeight: 20 }}>{parsed.description}</Text> : null}
          <Text size={12.5} color="muted">{[`${found.files.length + 1} ${found.files.length ? 'files' : 'file'}`, fileSize(size), parsed.meta.license ? `${parsed.meta.license} licence` : ''].filter(Boolean).join(' · ')}</Text>
          {scripts > 0 && (
            <Banner tone="warn" icon="alert">{`Includes ${scripts === 1 ? 'a script' : `${scripts} scripts`}. AI Hat keeps ${scripts === 1 ? 'it' : 'them'} as text for the assistant to read and never runs ${scripts === 1 ? 'it' : 'them'}.`}</Banner>
          )}
        </View>
      )}
      <View>
        <ListRow label="Turn on after adding" toggle={{ on: enable, onChange: setEnable }} />
        {mode === 'git' && <ListRow label="Keep updated from Git" sub={follow ? 'Checked once a day; your on/off and mode stay as they are' : undefined} toggle={{ on: follow, onChange: setFollow }} />}
      </View>
    </Screen>
  );
}
