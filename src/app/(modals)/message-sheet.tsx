import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, View } from 'react-native';

import { Icon, ListRow, Text, type IconName } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { isDesktop } from '@/lib/device';
import * as haptic from '@/lib/haptics';
import { useLayout } from '@/lib/layout';
import { submit } from '@/lib/send';
import { exportText } from '@/lib/share';
import { speak } from '@/lib/tts';
import { useChats, type Message } from '@/store/chats';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { useTheme } from '@/theme';

/** The message the menu is for: its text and how it was made (model, tokens, time, speed). */
function Preview({ msg, model }: { msg: Message; model?: string | null }) {
  const { colors } = useTheme();
  const stats = [
    model,
    msg.tokens ? `${msg.tokens} tok` : '',
    msg.ms ? `${(msg.ms / 1000).toFixed(1)} s` : '',
    msg.tokens && msg.ms ? `${Math.round(msg.tokens / (msg.ms / 1000))} tok/s` : '',
  ].filter(Boolean);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 10 }}>
      <Text size={14} numberOfLines={6} style={{ lineHeight: 21 }}>{msg.content.replace(/[#*_`>]+/g, '').trim() || 'No text'}</Text>
      {msg.role === 'assistant' && stats.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>
          {stats.map((s) => <Text key={s} mono size={11.5} color="muted">{s}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

export default function MessageSheet() {
  const { chatId, messageId } = useLocalSearchParams<{ chatId: string; messageId: string }>();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const msg = useChats((s) => s.messages[chatId]?.find((m) => m.id === messageId));
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const translateTo = useSettings((s) => s.translateTo);
  const [select, setSelect] = useState(false);
  if (!msg) return null;
  const done = (fn: () => void | Promise<void>) => async () => {
    await fn();
    router.back();
  };

  const tiles: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'copy', label: 'Copy', onPress: done(async () => { await Clipboard.setStringAsync(msg.content); haptic.success(); toast('Copied'); }) },
    { icon: 'speaker', label: 'Read aloud', onPress: done(async () => { try { await speak(msg.content); } catch (e: any) { Alert.alert('Could not read aloud', e.message); } }) },
    { icon: 'refresh', label: 'Retry with…', onPress: () => router.replace({ pathname: '/model-sheet', params: { chatId } }) },
    { icon: 'shareBox', label: 'Share', onPress: done(() => Share.share({ message: msg.content }).then(() => {})) },
  ];

  return (
    <RouteSheet title="Message actions" bare above={<Preview msg={msg} model={chat?.modelId} />}>
      <View>
        {wide ? <View style={{ paddingBottom: 12 }}><Preview msg={msg} model={chat?.modelId} /></View> : null}
        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.surface2 }}>
          {tiles.map((t) => (
            <Pressable key={t.label} accessibilityRole="menuitem" onPress={t.onPress} style={({ pressed }) => ({ flex: 1, height: 64, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
              <Icon name={t.icon} size={19} color={colors.text} />
              <Text size={12}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <ListRow icon="branch" label="Branch into new chat" height={50} chevron={false} onPress={async () => {
          const id = await useChats.getState().branch(chatId, messageId);
          router.replace(`/chat/${id}`);
        }} />
        <ListRow icon="translate" label="Translate" value={`to ${translateTo}`} height={50} chevron={false} onPress={done(() => submit(chatId, `Translate this into ${translateTo}. Keep formatting, code and names unchanged.\n\n${msg.content}`))} />
        <ListRow icon="cloud" label="Save as a file" value={isDesktop ? 'Downloads' : 'Drive, Files…'} height={50} chevron={false} onPress={done(async () => { await exportText(`message-${messageId.slice(0, 6)}.md`, msg.content); })} />
        <ListRow icon="text" label="Select text" height={50} chevron={false} onPress={() => setSelect(!select)} />
        {select && (
          <View style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 14, marginVertical: 4 }}>
            <Text size={14} selectable style={{ lineHeight: 21 }}>{msg.content}</Text>
          </View>
        )}
        <ListRow icon="trash" label="Delete message" danger height={50} chevron={false} onPress={done(() => useChats.getState().deleteMessage(chatId, messageId))} />
      </View>
    </RouteSheet>
  );
}
