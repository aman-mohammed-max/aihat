import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ListRow, Screen, SectionTitle, Segmented, Text } from '@/components';
import { useCommandList } from '@/lib/commands';
import { useLibrary, type Skill, type SkillFile } from '@/store/library';

export default function SkillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLibrary((x) => x.skills.find((k) => k.id === id));
  const commands = useCommandList();
  const [files, setFiles] = useState<SkillFile[]>([]);
  const fileCount = s?.fileCount ?? 0;
  useEffect(() => {
    if (id) useLibrary.getState().skillFiles(id).then(setFiles);
  }, [id, fileCount]);
  if (!s) return null;
  // The command name depends on the others (a name taken by a built-in command or another skill gets a prefix or number).
  const command = commands.find((c) => c.kind === 'skill' && c.ref === s.id)?.name;
  const save = (patch: Partial<Skill>) => useLibrary.getState().saveSkill({ ...s, ...patch });
  return (
    <Screen header={{ title: s.name }} footer={<Button label="Remove skill" variant="danger" flex onPress={async () => { await useLibrary.getState().deleteSkill(id); router.back(); }} />}>
      <Card><ListRow label={s.enabled ? 'Skill is on' : 'Skill is off'} toggle={{ on: s.enabled, onChange: (enabled) => save({ enabled }) }} last /></Card>
      <Text color="text2">{s.description}</Text>
      <View style={{ gap: 8 }}>
        <SectionTitle>When to use it</SectionTitle>
        <Segmented<Skill['mode']> options={[{ value: 'auto', label: 'Automatic' }, { value: 'always', label: 'Always' }, { value: 'onAsk', label: 'When I ask' }]} value={s.mode} onChange={(mode) => save({ mode })} />
      </View>
      <View>
        <SectionTitle>Instructions (SKILL.md)</SectionTitle>
        <Card style={{ padding: 14 }}><Text mono size={12.5} color="text2">{s.body || 'Empty'}</Text></Card>
      </View>
      {files.length > 0 && (
        <View>
          <SectionTitle>{`Files · ${files.length}`}</SectionTitle>
          <Card>
            {files.map((f, i) => (
              <ListRow key={f.path} mono label={f.path} sub={/\.(py|sh|bash|js|mjs|ts|rb|php|pl|lua|go|rs|java|kt|swift|c|cpp|cs|sql|r)$/i.test(f.path) ? 'Script: read only, never run' : undefined} value={f.size >= 1000 ? `${(f.size / 1000).toFixed(1)} kB` : `${f.size} B`} onPress={() => router.push({ pathname: '/skill-file', params: { id, path: f.path } })} last={i === files.length - 1} />
            ))}
          </Card>
          <Text size={12.5} color="muted" style={{ marginTop: 8, paddingLeft: 4, lineHeight: 18 }}>The assistant can open these when the instructions point to them. Scripts are kept as text; they can’t be run on the phone.</Text>
        </View>
      )}
      <Card>
        <ListRow label="Command" value={command ? `/${command}` : 'Turn the skill on to get one'} mono={!!command} />
        <ListRow label="Source" value={s.source} />
        <ListRow label="Version" value={s.version} last />
      </Card>
    </Screen>
  );
}
