import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { Header, Icon, Text, type IconName } from '@/components';
import { isDesktop } from '@/lib/device';
import { readBytes, saveFile } from '@/lib/files';
import { b64ToBytes } from '@/lib/media';
import { useChats } from '@/store/chats';
import { toast } from '@/store/toast';
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

  /** Share sheet on a phone; Downloads on a computer. */
  const share = async () => {
    if (!img) return;
    try {
      const bytes = img.uri.startsWith('data:') ? b64ToBytes(img.uri.split(',')[1]) : await readBytes(img.uri);
      const path = await saveFile(`image-${Date.now()}.png`, bytes, 'image/png');
      if (path) toast(`Saved to ${path}`);
    } catch (e: any) {
      toast(e?.message ?? 'The image could not be saved.');
    }
  };
  const actions: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'link', label: isDesktop ? 'Save' : 'Share', onPress: share },
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
