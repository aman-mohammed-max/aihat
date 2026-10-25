import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, ScrollView } from 'react-native';

import { Button, Card, Chip, Header, Icon, PageShell, SearchBar, Text, useColumn } from '@/components';
import { useLayout } from '@/lib/layout';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme';
import { exportText } from '@/lib/share';

export default function Prompts() {
  const { colors } = useTheme();
  const prompts = useLibrary((s) => s.prompts);
  const { wide } = useLayout();
  const column = useColumn();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('All');
  const tags = ['All', 'Favorites', ...Array.from(new Set(prompts.flatMap((p) => p.tags)))];
  const list = prompts.filter((p) => (tag === 'All' || (tag === 'Favorites' ? p.favorite : p.tags.includes(tag))) && `${p.name} ${p.body}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <PageShell>
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header left={wide ? 'none' : 'back'} title="System prompts" right="add" addLabel="New prompt" onAdd={() => router.push('/prompt-edit')} />
      <ScrollView contentContainerStyle={[{ padding: wide ? 24 : 16, gap: 12 }, column]}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Search prompts" hint={q ? `${list.length} results` : undefined} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {tags.map((t) => <Chip key={t} label={t} selected={tag === t} onPress={() => setTag(t)} />)}
        </ScrollView>
        {list.length === 0 && <Text color="muted">{prompts.length ? 'No matches.' : 'No prompts yet. Tap + to write one.'}</Text>}
        <Card>
          {list.map((p, i) => (
            <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/prompt-edit', params: { id: p.id } })} style={{ padding: 14, gap: 4, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text weight="medium" style={{ flex: 1 }}>{p.name}</Text>
                {p.favorite && <Icon name="pin" size={14} color={colors.accent} />}
              </View>
              <Text size={13} color="text2" numberOfLines={2}>{p.body}</Text>
              <Text size={12} color="muted">{[...p.tags, `~${Math.ceil(p.body.length / 4)} tok`, p.variables.length ? `${p.variables.length} variables` : ''].filter(Boolean).join(' · ')}</Text>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
      <View style={[{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28 }, column]}>
        <Button label="Export all" variant="outline" flex onPress={() => exportText('prompts.json', JSON.stringify(prompts, null, 2))} />
      </View>
    </View>
    </PageShell>
  );
}
