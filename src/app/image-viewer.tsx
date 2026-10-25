import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { Header, Icon, Text, type IconName } from '@/components';
import { useChats } from '@/store/chats';
import { useTheme } from '@/theme';

export default function ImageViewer() {
  const { chatId, messageId, index } = useLocalSearchParams<{ chatId: string; messageId: string; index: string }>();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const msg = useChats((s) => s.messages[chatId]?.find((m) => m.id === messageId));
  const images = msg?.attachments.filter((a) => a.kind === 'image') ?? [];
  const [i, setI] = useState(Number(index) || 0);
  const img = images[i];
  const user = useChats((s) => s.messages[chatId]?.find((m) => m.role === 'user' && m.createdAt < (msg?.createdAt ?? 0)));

  const share = async () => {
    if (!img) return;
    let uri = img.uri;
    if (uri.startsWith('data:')) {
      const f = new File(Paths.cache, `image-${Date.now()}.png`);
      f.write(Uint8Array.from(atob(uri.split(',')[1]), (c) => c.charCodeAt(0)));
      uri = f.uri;
    }
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
  };
  const actions: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'link', label: 'Share', onPress: share },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      <Header left="close" title={`${i + 1} of ${images.length}`} />
      <Pressable accessibilityLabel="Next image" onPress={() => setI((i + 1) % Math.max(images.length, 1))} style={{ flex: 1, justifyContent: 'center' }}>
        {img ? <Image source={{ uri: img.uri }} style={{ width, height: width }} contentFit="contain" accessibilityLabel={`Generated image ${i + 1} of ${images.length}`} /> : null}
      </Pressable>
      {user ? <Text size={13} color="muted" style={{ padding: 16 }} numberOfLines={3}>“{user.content}”</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', padding: 16, paddingBottom: 32 }}>
        {actions.map((a) => (
          <Pressable key={a.label} accessibilityRole="button" onPress={a.onPress} style={{ minWidth: 64, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Icon name={a.icon} size={22} color={colors.text} />
            <Text size={12}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
