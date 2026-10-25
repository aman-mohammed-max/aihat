import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, SearchBar, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

export default function PromptSheet() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const { colors } = useTheme();
  const prompts = useLibrary((s) => s.prompts);
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const defaults = useSettings();
  const [q, setQ] = useState('');
  const current = chat ? chat.promptId : defaults.defaultPromptId;

  const pick = (id: string | null) => {
    if (chatId) useChats.getState().patch(chatId, { promptId: id });
    else defaults.set({ defaultPromptId: id });
    router.back();
  };
  const list = prompts.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const row = ({ id, name, sub }: { id: string | null; name: string; sub: string }) => (
    <Pressable accessibilityRole="button" onPress={() => pick(id)} style={{ minHeight: 56, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text weight="medium">{name}</Text>
        <Text size={12.5} color="muted" numberOfLines={1}>{sub}</Text>
      </View>
      {current === id && <Icon name="check" size={18} color={colors.accent} />}
    </Pressable>
  );

  return (
    <RouteSheet
      title="System prompt"
      footer={[
        { label: 'New prompt', onPress: () => router.replace('/prompt-edit') },
        { label: 'Manage prompts', onPress: () => router.replace('/prompts') },
      ]}>
      <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${prompts.length} prompts`} />
      {row({ id: null, name: 'None', sub: "Use the model's own behaviour" })}
      {list.some((p) => p.favorite) && <Text size={12} weight="medium" color="muted">Favorites</Text>}
      {list.filter((p) => p.favorite).map((p) => <View key={p.id}>{row({ id: p.id, name: p.name, sub: p.body })}</View>)}
      <Text size={12} weight="medium" color="muted">All prompts</Text>
      {list.filter((p) => !p.favorite).map((p) => <View key={p.id}>{row({ id: p.id, name: p.name, sub: p.body })}</View>)}
    </RouteSheet>
  );
}
