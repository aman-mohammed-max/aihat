import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { Button, Chip, Icon, Screen, SearchBar, Text } from '@/components';
import { readText } from '@/lib/files';
import { exportText } from '@/lib/share';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

/** Read prompts from a .json export (a list) or a Markdown file (one prompt, named by its first heading or file name). */
async function importPrompts() {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/markdown', 'text/plain', '*/*'], multiple: true });
  if (res.canceled) return;
  let n = 0;
  for (const a of res.assets) {
    const text = await readText(a.uri);
    if (/\.json$/i.test(a.name)) {
      const list = JSON.parse(text);
      for (const p of Array.isArray(list) ? list : [list]) {
        if (typeof p?.body !== 'string') continue;
        await useLibrary.getState().savePrompt({ name: String(p.name ?? 'Imported'), body: p.body, tags: Array.isArray(p.tags) ? p.tags : [], favorite: !!p.favorite, toolIds: [], variables: Array.isArray(p.variables) ? p.variables : [] });
        n++;
      }
    } else {
      const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
      await useLibrary.getState().savePrompt({ name: heading || a.name.replace(/\.(md|markdown|txt)$/i, ''), body: heading ? text.replace(/^#\s+.+\n?/m, '').trim() : text.trim(), tags: [], favorite: false, toolIds: [], variables: [] });
      n++;
    }
  }
  Alert.alert(n ? `Imported ${n} prompt${n === 1 ? '' : 's'}` : 'Nothing to import', n ? undefined : 'Pick a .json export from this app or a Markdown file.');
}

export default function Prompts() {
  const { colors } = useTheme();
  const prompts = useLibrary((s) => s.prompts);
  const inUse = useSettings((s) => s.defaultPromptId);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('All');
  const tags = ['All', 'Favorites', ...Array.from(new Set(prompts.flatMap((p) => p.tags)))];
  const list = prompts.filter((p) => (tag === 'All' || (tag === 'Favorites' ? p.favorite : p.tags.includes(tag))) && `${p.name} ${p.body}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen
      header={{ title: 'System prompts', sub: `${prompts.length} saved`, right: 'add', addLabel: 'New system prompt', onAdd: () => router.push('/prompt-edit') }}
      gap={0}
      top={
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search prompts" hint={q ? `${list.length} results` : undefined} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
            {tags.map((t) => <Chip key={t} label={t} selected={tag === t} onPress={() => setTag(t)} />)}
          </ScrollView>
        </>
      }
      footer={
        <>
          <Button label="Import .md / .json" variant="outline" height={44} flex onPress={() => importPrompts().catch((e) => Alert.alert('Import failed', e.message))} />
          <Button label="Export all" variant="outline" height={44} flex onPress={() => exportText('prompts.json', JSON.stringify(prompts, null, 2))} />
        </>
      }>
      {list.length === 0 && <Text color="muted" style={{ padding: 4, paddingTop: 12 }}>{prompts.length ? 'No matches.' : 'No prompts yet. Tap + to write one.'}</Text>}
      {list.map((p, i) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/prompt-edit', params: { id: p.id } })} style={{ paddingVertical: 13, paddingHorizontal: 4, gap: 4, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text size={15} weight="medium" style={{ flex: 1 }}>{p.name}</Text>
            {p.id === inUse ? (
              <View style={{ backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text size={11} weight="semi" color="onAccent">In use</Text>
              </View>
            ) : p.favorite ? (
              <Icon name="star" size={14} color={colors.accent} />
            ) : null}
          </View>
          <Text size={13} color="muted" numberOfLines={2} style={{ lineHeight: 18 }}>{p.body}</Text>
          <Text size={12} color="muted">{[...p.tags, `~${Math.ceil(p.body.length / 4)} tok`, p.variables.length ? `${p.variables.length} variables` : '', p.preferredModelId ? `default model: ${p.preferredModelId}` : ''].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
