import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, LinkRow, Panel, PanelRow, Screen, SectionTitle, Segmented, Text, Toggle } from '@/components';
import { useCommandList } from '@/lib/commands';
import { device } from '@/lib/device';
import { fileSize, SCRIPT_FILE, sourceLabel } from '@/lib/skills';
import { useLibrary, type Skill, type SkillFile } from '@/store/library';
import { useTheme } from '@/theme';

const PREVIEW = 1500;

export default function SkillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const s = useLibrary((x) => x.skills.find((k) => k.id === id));
  const commands = useCommandList();
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [full, setFull] = useState(false);
  const fileCount = s?.fileCount ?? 0;
  useEffect(() => {
    if (id) useLibrary.getState().skillFiles(id).then(setFiles);
  }, [id, fileCount]);
  if (!s) return null;
  // The command name depends on the others (a name taken by a built-in command or another skill gets a prefix or number).
  const command = commands.find((c) => c.kind === 'skill' && c.ref === s.id)?.name;
  const save = (patch: Partial<Skill>) => useLibrary.getState().saveSkill({ ...s, ...patch });
  const body = s.body || 'Empty';
  return (
    <Screen
      header={{ title: s.name, sub: `v${s.version} · ${sourceLabel(s.source)}` }}
      gap={20}
      footer={<Button label="Remove skill" variant="danger" flex onPress={async () => { await useLibrary.getState().deleteSkill(id); router.back(); }} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 16, padding: 14 }}>
        <Text size={15} weight="medium" style={{ flex: 1 }}>{s.enabled ? 'Skill is on' : 'Skill is off'}</Text>
        <Toggle on={s.enabled} label="Skill on" onChange={(enabled) => save({ enabled })} />
      </View>
      {s.description ? <Text size={14.5} color="text2" style={{ lineHeight: 22.5, paddingHorizontal: 4 }}>{s.description}</Text> : null}
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>When to use it</SectionTitle>
        <Segmented<Skill['mode']> options={[{ value: 'auto', label: 'Automatic' }, { value: 'always', label: 'Always' }, { value: 'onAsk', label: 'When I ask' }]} value={s.mode} onChange={(mode) => save({ mode })} />
      </View>
      {files.length > 0 && (
        <View>
          <SectionTitle space={8}>{`Files · ${files.length}`}</SectionTitle>
          <Panel>
            {files.map((f) => (
              <PanelRow key={f.path} mono label={f.path} sub={SCRIPT_FILE.test(f.path) ? 'Script: read only, never run' : undefined} value={fileSize(f.size)} height={52} onPress={() => router.push({ pathname: '/skill-file', params: { id, path: f.path } })} />
            ))}
          </Panel>
          <Text size={12.5} color="muted" style={{ marginTop: 8, paddingHorizontal: 4, lineHeight: 19 }}>{`The assistant can open these when the instructions point to them. Scripts are kept as text; they can’t be run on this ${device}.`}</Text>
        </View>
      )}
      <View>
        <SectionTitle space={8}>Instructions (SKILL.md)</SectionTitle>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14 }}>
          <Text mono size={12.5} color="text2" selectable style={{ lineHeight: 19.4 }}>{full || body.length <= PREVIEW ? body : `${body.slice(0, PREVIEW).trimEnd()}…`}</Text>
        </View>
        {body.length > PREVIEW && <LinkRow label={full ? 'Show less' : `Show all ${body.length.toLocaleString('en-US')} characters`} onPress={() => setFull(!full)} />}
      </View>
      <Panel>
        <PanelRow label="Command" value={command ? `/${command}` : 'Turn the skill on to get one'} monoValue={!!command} height={52} />
        <PanelRow label="Source" value={s.source === 'local' ? 'Written here' : s.source} />
        <PanelRow label="Version" value={s.version} />
      </Panel>
    </Screen>
  );
}
