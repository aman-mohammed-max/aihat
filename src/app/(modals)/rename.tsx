import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput } from 'react-native';

import { Button, Text } from '@/components';
import { RouteDialog } from '@/components/RouteOverlays';
import { fonts, useTheme } from '@/theme';
import { generateTitle, useChats } from '@/store/chats';

export default function Rename() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { colors } = useTheme();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const [name, setName] = useState(chat?.title ?? '');
  const [busy, setBusy] = useState(false);
  const suggest = async () => {
    setBusy(true);
    const t = await generateTitle(chatId);
    setBusy(false);
    if (t) setName(t);
    else Alert.alert('No suggestion', 'The model did not return a title. Check the endpoint, or type one yourself.');
  };
  return (
    <RouteDialog title="Rename chat" confirmLabel="Save" onConfirm={() => { useChats.getState().patch(chatId, { title: name.trim() || 'Untitled', titleLocked: true }); router.back(); }}>
      <Text size={12.5} color="muted">Chat name</Text>
      <TextInput accessibilityLabel="Chat name" value={name} onChangeText={setName} autoFocus selectTextOnFocus style={{ height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.ui, fontSize: 15 }} />
      <Button label={busy ? 'Thinking…' : 'Suggest a name'} variant="outline" height={40} onPress={suggest} disabled={busy} />
    </RouteDialog>
  );
}
