import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, SearchBar, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { useLibrary, type SystemPrompt } from '@/store/library';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

export default function PromptSheet() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const { colors } = useTheme();
  const prompts = useLibrary((s) => s.prompts);
  const chats = useChats((s) => s.chats);
  const chat = chats.find((c) => c.id === chatId);
  const defaults = useSettings();
  const [q, setQ] = useState('');
  const current = chat ? chat.promptId : defaults.defaultPromptId;

  const pick = (id: string | null) => {
    if (chatId) useChats.getState().patch(chatId, { promptId: id });
    else defaults.set({ defaultPromptId: id });
    router.back();
  };

  // Recent: the prompts of the chats you used last.
  const recentIds = [...new Set([...chats].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => c.promptId).filter((x): x is string => !!x))].slice(0, 3);
  const recent = recentIds.map((id) => prompts.find((p) => p.id === id)).filter((p): p is SystemPrompt => !!p);
  const favorites = prompts.filter((p) => p.favorite && !recentIds.includes(p.id));
  const others = prompts.filter((p) => !p.favorite && !recentIds.includes(p.id));
  const found = prompts.filter((p) => `${p.name} ${p.body}`.toLowerCase().includes(q.toLowerCase()));

  const row = (p: SystemPrompt) => (
    <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: current === p.id }} onPress={() => pick(p.id)} style={({ pressed }) => ({ minHeight: 58, paddingHorizontal: 4, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text size={15} numberOfLines={1}>{p.name}</Text>
        <Text size={12.5} color="muted" numberOfLines={1}>{p.body.replace(/\s+/g, ' ')}</Text>
      </View>
      {current === p.id && <Icon name="check" size={18} color={colors.accent} strokeWidth={2} />}
    </Pressable>
  );
  const heading = (title: string) => <Text size={12} weight="medium" color="muted" style={{ paddingTop: 14, paddingBottom: 4, paddingHorizontal: 4 }}>{title}</Text>;

  return (
    <RouteSheet
      title="System prompt"
      footerLine
      footer={[
        { label: 'New prompt', onPress: () => router.replace('/prompt-edit') },
        { label: 'Manage prompts', onPress: () => router.replace('/prompts') },
      ]}>
      <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${prompts.length} prompts`} />
      <View>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: current === null }} onPress={() => pick(null)} style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 4, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1, borderBottomWidth: 1, borderBottomColor: colors.surface2 })}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text size={15}>None</Text>
            <Text size={12.5} color="muted">Use the model’s own behaviour</Text>
          </View>
          {current === null && <Icon name="check" size={18} color={colors.accent} strokeWidth={2} />}
        </Pressable>
        {q ? (
          <>
            {heading(`${found.length} found`)}
            {found.map(row)}
          </>
        ) : (
          <>
            {recent.length > 0 && heading('Recent')}
            {recent.map(row)}
            {favorites.length > 0 && heading('Favorites')}
            {favorites.map(row)}
            {others.length > 0 && heading(recent.length || favorites.length ? 'All prompts' : 'Prompts')}
            {others.map(row)}
          </>
        )}
        {prompts.length === 0 && <Text size={13.5} color="muted" style={{ paddingHorizontal: 4, paddingTop: 14 }}>No saved prompts yet.</Text>}
      </View>
    </RouteSheet>
  );
}
