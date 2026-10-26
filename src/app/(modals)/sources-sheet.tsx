import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';

import { Icon, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { useTheme } from '@/theme';

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default function SourcesSheet() {
  const { chatId, messageId } = useLocalSearchParams<{ chatId: string; messageId: string }>();
  const { colors } = useTheme();
  const msg = useChats((s) => s.messages[chatId]?.find((m) => m.id === messageId));
  const cites = msg?.citations ?? [];
  const queries = [...new Set(cites.map((c) => c.query).filter((q): q is string => !!q))];
  return (
    <RouteSheet title="Sources" footerLine footer={[{ label: 'Web search settings', onPress: () => router.replace('/web-search') }]}>
      {queries.length > 0 && (
        <View style={{ gap: 6, paddingHorizontal: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.surface2 }}>
          <Text size={12} weight="medium" color="muted">Searched for</Text>
          {queries.map((q) => (
            <View key={q} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="search" size={14} color={colors.muted} />
              <Text size={14} numberOfLines={2} style={{ flex: 1 }}>{q}</Text>
            </View>
          ))}
        </View>
      )}
      <View>
        {cites.length === 0 && <Text color="muted" style={{ paddingHorizontal: 4 }}>No sources were cited in this reply.</Text>}
        {cites.map((c, i) => (
          <Pressable
            key={`${c.url}${i}`}
            accessibilityRole="link"
            accessibilityLabel={`Source ${i + 1}: ${c.title}, ${host(c.url)}`}
            onPress={() => Linking.openURL(c.url)}
            style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 4, opacity: pressed ? 0.7 : 1, borderBottomWidth: i < cites.length - 1 ? 1 : 0, borderBottomColor: colors.surface2 })}>
            <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' }}>
              <Text size={12}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text size={12} color="muted">{host(c.url)}</Text>
              <Text size={14.5} numberOfLines={2}>{c.title}</Text>
              {c.snippet ? <Text size={12.5} color="muted" numberOfLines={3} style={{ lineHeight: 17.5 }}>{c.snippet}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </RouteSheet>
  );
}
