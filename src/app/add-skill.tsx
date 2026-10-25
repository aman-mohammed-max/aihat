import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { Button, Card, ListRow, Screen, Segmented, Text, Field } from '@/components';
import { pickFiles } from '@/lib/attach';
import { useLibrary } from '@/store/library';
import { fonts, radii, useTheme } from '@/theme';


type Mode = 'git' | 'file' | 'write';

/** Parses SKILL.md front-matter: `name:` and `description:`; the rest is the body. */
function parseSkill(md: string) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = m?.[1] ?? '';
  const get = (k: string) => meta.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  return { name: get('name'), description: get('description'), body: (m?.[2] ?? md).trim() };
}

export default function AddSkill() {
  const { colors, body } = useTheme();
  const [mode, setMode] = useState<Mode>('write');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [text, setText] = useState('');
  const [enable, setEnable] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchGit = async () => {
    // Accepts github.com/<o>/<r>/tree/<branch>/<path> and fetches <path>/SKILL.md from raw.githubusercontent.com.
    const m = url.replace(/^https?:\/\//, '').match(/^github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)\/?(.*))?$/);
    if (!m) throw new Error('Use a github.com repository or folder URL.');
    const [, owner, repo, branch = 'main', path = ''] = m;
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path ? path + '/' : ''}SKILL.md`);
    if (!res.ok) throw new Error('No SKILL.md found at that location.');
    return { md: await res.text(), source: `github.com/${owner}/${repo}` };
  };

  const add = async () => {
    setBusy(true);
    try {
      let md = text, source = 'local';
      if (mode === 'git') ({ md, source } = await fetchGit());
      if (mode === 'file') {
        const [f] = await pickFiles();
        if (!f?.text) throw new Error('Pick a SKILL.md file.');
        md = f.text;
      }
      const parsed = parseSkill(md);
      const finalName = (mode === 'write' ? name : parsed.name ?? name).trim();
      if (!finalName) throw new Error('The skill needs a name.');
      const id = await useLibrary.getState().saveSkill({ name: finalName, description: (mode === 'write' ? desc : parsed.description ?? desc), body: parsed.body, source, enabled: enable });
      router.replace({ pathname: '/skill-detail', params: { id } });
    } catch (e: any) {
      Alert.alert('Could not add skill', e.message);
    } finally { setBusy(false); }
  };

  return (
    <Screen header={{ title: 'Add skill' }} footer={<Button label={busy ? 'Adding…' : 'Add skill'} flex onPress={add} disabled={busy} />}>
      <Segmented<Mode> options={[{ value: 'git', label: 'Git URL' }, { value: 'file', label: 'Upload SKILL.md' }, { value: 'write', label: 'Write new' }]} value={mode} onChange={setMode} />
      {mode === 'git' && <Field label="Repository or folder URL" value={url} onChangeText={setUrl} placeholder="github.com/you/skills/tree/main/commit-writer" hint="Must contain a SKILL.md at the top." />}
      {mode === 'file' && <Text color="muted">You’ll pick a SKILL.md file when you tap Add skill.</Text>}
      {mode === 'write' && (
        <>
          <Field label="Name" value={name} onChangeText={setName} placeholder="commit-writer" />
          <Field label="What it does" value={desc} onChangeText={setDesc} autoCapitalize="sentences" />
          <View style={{ gap: 6 }}>
            <Text size={12.5} weight="medium" color="muted">Instructions</Text>
            <TextInput accessibilityLabel="Instructions" value={text} onChangeText={setText} multiline textAlignVertical="top" style={{ minHeight: 180, borderRadius: radii.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.text, fontFamily: fonts.mono, fontSize: body - 1.5 }} />
          </View>
        </>
      )}
      <Card><ListRow label="Turn on after adding" toggle={{ on: enable, onChange: setEnable }} last /></Card>
    </Screen>
  );
}
