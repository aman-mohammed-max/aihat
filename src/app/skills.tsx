import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, LinkCard, Screen, SearchBar, SectionTitle, Text, ThingRow } from '@/components';
import { useLibrary } from '@/store/library';

export default function Skills() {
  const skills = useLibrary((s) => s.skills);
  const [q, setQ] = useState('');
  const list = skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()));
  const on = list.filter((s) => s.enabled);
  const off = list.filter((s) => !s.enabled);
  const rows = (items: typeof list, lastLine: boolean) =>
    items.map((s, i) => (
      <ThingRow
        key={s.id}
        name={s.name}
        sub={s.description}
        divider={lastLine || i < items.length - 1}
        onPress={() => router.push({ pathname: '/skill-detail', params: { id: s.id } })}
        toggle={{ on: s.enabled, onChange: (enabled) => useLibrary.getState().saveSkill({ ...s, enabled }) }}
      />
    ));
  return (
    <Screen
      header={{ title: 'Skills', sub: skills.length ? `${skills.filter((s) => s.enabled).length} of ${skills.length} on` : undefined, right: 'add', addLabel: 'Add skill', onAdd: () => router.push('/add-skill') }}
      gap={0}
      top={
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search skills" hint={q ? `${list.length} results` : undefined} />
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <LinkCard items={[{ icon: 'store', label: 'Browse skills', sub: 'Find and add skills from public libraries', onPress: () => router.push('/market') }]} />
          </View>
          <Text size={13} color="muted" style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, lineHeight: 19 }}>
            Skills are instructions the model loads only when a task needs them. Each one is also a command: type / and pick it, or type its name.
          </Text>
        </>
      }
      footer={<Button label="Add skill" height={48} flex onPress={() => router.push('/add-skill')} />}>
      {skills.length === 0 && <Text color="muted" style={{ padding: 4, paddingTop: 8 }}>No skills yet. Browse the libraries above or add your own.</Text>}
      {skills.length > 0 && list.length === 0 && <Text color="muted" style={{ padding: 4, paddingTop: 8 }}>No matches.</Text>}
      {on.length > 0 && (
        <View style={{ paddingTop: 4 }}>
          <SectionTitle>On</SectionTitle>
          {rows(on, off.length > 0)}
        </View>
      )}
      {off.length > 0 && (
        <View style={{ paddingTop: on.length ? 16 : 4 }}>
          <SectionTitle>Off</SectionTitle>
          {rows(off, false)}
        </View>
      )}
    </Screen>
  );
}
