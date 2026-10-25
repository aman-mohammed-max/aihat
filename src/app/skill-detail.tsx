import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, ListRow, Screen, SectionTitle, Segmented, Text } from '@/components';
import { useLibrary, type Skill } from '@/store/library';

export default function SkillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLibrary((x) => x.skills.find((k) => k.id === id));
  if (!s) return null;
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
      <Card>
        <ListRow label="Source" value={s.source} />
        <ListRow label="Version" value={s.version} last />
      </Card>
    </Screen>
  );
}
