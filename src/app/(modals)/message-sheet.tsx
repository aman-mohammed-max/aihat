import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Share } from 'react-native';

import { Card, ListRow, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { submit } from '@/lib/send';
import { speak } from '@/lib/tts';
import { useChats } from '@/store/chats';
import { useSettings } from '@/store/settings';

export default function MessageSheet() {
  const { chatId, messageId } = useLocalSearchParams<{ chatId: string; messageId: string }>();
  const msg = useChats((s) => s.messages[chatId]?.find((m) => m.id === messageId));
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const translateTo = useSettings((s) => s.translateTo);
  if (!msg) return null;
  const done = (fn: () => void | Promise<void>) => async () => { await fn(); router.back(); };

  return (
    <RouteSheet title="Message" snapPoints={['62%']}>
      <Text color="text2" numberOfLines={3}>{msg.content}</Text>
      {msg.tokens ? <Text mono size={12} color="muted">{[chat?.modelId, `${msg.tokens} tok`, msg.ms ? `${(msg.ms / 1000).toFixed(1)} s` : ''].filter(Boolean).join('  ·  ')}</Text> : null}
      <Card>
        <ListRow icon="copy" label="Copy" onPress={done(async () => { await Clipboard.setStringAsync(msg.content); })} />
        <ListRow icon="speaker" label="Read aloud" onPress={done(async () => { try { await speak(msg.content); } catch (e: any) { Alert.alert('Could not read aloud', e.message); } })} />
        <ListRow icon="refresh" label="Retry with another model…" onPress={() => router.replace({ pathname: '/model-sheet', params: { chatId } })} />
        <ListRow icon="link" label="Share" onPress={done(() => Share.share({ message: msg.content }).then(() => {}))} />
        <ListRow icon="edit" label="Branch into new chat" onPress={async () => {
          const id = await useChats.getState().branch(chatId, messageId);
          router.replace(`/chat/${id}`);
        }} />
        <ListRow icon="globe" label={`Translate to ${translateTo}`} onPress={done(() => submit(chatId, `Translate this into ${translateTo}. Keep formatting, code and names unchanged.\n\n${msg.content}`))} />
        <ListRow icon="trash" label="Delete message" danger last onPress={done(() => useChats.getState().deleteMessage(chatId, messageId))} />
      </Card>
    </RouteSheet>
  );
}
