import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Screen, SearchBar, SectionTitle, Text, Toggle } from '@/components';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme';

export default function Skills() {
  const { colors } = useTheme();
  const skills = useLibrary((s) => s.skills);
  const [q, setQ] = useState('');
  const list = skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()));
  const group = ({ title, items }: { title: string; items: typeof list }) =>
    items.length ? (
      <View>
        <SectionTitle>{title}</SectionTitle>
        <Card>
          {items.map((s, i) => (
            <View key={s.id} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12, borderBottomWidth: i === items.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/skill-detail', params: { id: s.id } })} style={{ flex: 1, paddingVertical: 8 }}>
                <Text weight="medium">{s.name}</Text>
                <Text size={12.5} color="muted" numberOfLines={1}>{s.description}</Text>
              </Pressable>
              <Toggle on={s.enabled} label={s.name} onChange={(enabled) => useLibrary.getState().saveSkill({ ...s, enabled })} />
            </View>
          ))}
        </Card>
      </View>
    ) : null;
  return (
    <Screen header={{ title: 'Skills' }} footer={<Button label="Add skill" flex onPress={() => router.push('/add-skill')} />}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search skills" />
      <Text size={13} color="muted">Skills are instructions the model loads only when a task needs them.</Text>
      {skills.length === 0 && <Text color="muted">No skills yet.</Text>}
      {group({ title: "On", items: list.filter((s) => s.enabled) })}
      {group({ title: "Off", items: list.filter((s) => !s.enabled) })}
    </Screen>
  );
}
