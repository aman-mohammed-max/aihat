import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';

import { Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { useTheme } from '@/theme';

export default function SourcesSheet() {
  const { chatId, messageId } = useLocalSearchParams<{ chatId: string; messageId: string }>();
  const { colors } = useTheme();
  const msg = useChats((s) => s.messages[chatId]?.find((m) => m.id === messageId));
  const cites = msg?.citations ?? [];
  return (
    <RouteSheet title="Sources" footer={[{ label: 'Web search settings', onPress: () => router.replace('/web-search') }]}>
      {cites.length === 0 && <Text color="muted">No sources were cited in this reply.</Text>}
      {cites.map((c, i) => (
        <Pressable key={c.url} accessibilityRole="link" onPress={() => Linking.openURL(c.url)} style={{ minHeight: 56, flexDirection: 'row', gap: 12, paddingVertical: 8 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Text size={12} mono>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text size={12} color="muted">{new URL(c.url).hostname}</Text>
            <Text numberOfLines={2}>{c.title}</Text>
          </View>
        </Pressable>
      ))}
    </RouteSheet>
  );
}
