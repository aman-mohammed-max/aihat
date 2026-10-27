import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, TextInput } from 'react-native';

import { Text } from '@/components';
import { RouteDialog } from '@/components/RouteOverlays';
import { fonts, useTheme } from '@/theme';
import { generateTitle, useChats } from '@/store/chats';

export default function Rename() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { colors } = useTheme();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const [name, setName] = useState(chat?.title ?? '');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const save = () => {
    useChats.getState().patch(chatId, { title: name.trim() || 'Untitled', titleLocked: true });
    router.back();
  };
  const suggest = async () => {
    setBusy(true);
    const t = await generateTitle(chatId);
    setBusy(false);
    if (t) setName(t);
    else Alert.alert('No suggestion', 'The model did not return a title. Check the endpoint, or type one yourself.');
  };
  return (
    <RouteDialog title="Rename chat" confirmLabel="Save" onConfirm={save}>
      <TextInput accessibilityLabel="Chat name" value={name} onChangeText={setName} selectionColor={colors.accent} autoFocus selectTextOnFocus onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} returnKeyType="done" onSubmitEditing={save} style={{ height: 46, borderRadius: 12, borderWidth: 1, borderColor: focused ? colors.accent : colors.field, backgroundColor: colors.bg, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.ui, fontSize: 15 }} />
      <Pressable accessibilityRole="button" onPress={suggest} disabled={busy} style={({ pressed }) => ({ alignSelf: 'flex-start', height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, justifyContent: 'center', opacity: busy ? 0.5 : pressed ? 0.7 : 1 })}>
        <Text size={13} color="text2">{busy ? 'Thinking…' : 'Suggest a name'}</Text>
      </Pressable>
    </RouteDialog>
  );
}
