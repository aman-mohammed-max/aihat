import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, View, type PressableStateCallbackType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Message } from '@/store/chats';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** What the reply searched for: the queries of its web_search calls. */
const queries = (m?: Message) =>
  (m?.toolCalls ?? [])
    .filter((t) => t.name === 'web_search')
    .map((t) => {
      try {
        return String(JSON.parse(t.args).query ?? '');
      } catch {
        return '';
      }
    })
    .filter(Boolean);

/** Wide windows (1280 px and up): a reply's sources beside the chat, instead of a sheet over it. */
export function SourcesPanel({ message, onClose }: { message?: Message; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cites = message?.citations ?? [];
  const searched = queries(message);
  const hover = (s: PressableStateCallbackType) => ((s as { hovered?: boolean }).hovered || s.pressed ? colors.surface : 'transparent');
  return (
    <View accessibilityLabel="Sources" style={{ width: 340, borderLeftWidth: 1, borderLeftColor: colors.hairline, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 8 }}>
        <Text size={15} weight="semi" style={{ flex: 1 }}>Sources</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close sources" onPress={onClose} style={(s) => ({ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: hover(s) })}>
          <Icon name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>
      {searched.length > 0 && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text size={11.5} weight="medium" color="muted">Searched for</Text>
          {searched.map((q, i) => <Text key={`${q}-${i}`} size={13} color="text2">{q}</Text>)}
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 6 }}>
        {cites.length === 0 && <Text size={13} color="muted" style={{ padding: 8, lineHeight: 19 }}>No sources yet. When a reply searches the web, the pages it used are listed here.</Text>}
        {cites.map((c, i) => (
          <Pressable key={`${c.url}-${i}`} accessibilityRole="link" onPress={() => Linking.openURL(c.url)} style={(s) => ({ flexDirection: 'row', gap: 10, padding: 10, borderRadius: 12, backgroundColor: hover(s) })}>
            <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Text size={11} mono>{i + 1}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text size={11.5} color="muted" numberOfLines={1}>{host(c.url)}</Text>
              <Text size={13.5} numberOfLines={3}>{c.title || c.url}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={() => router.push('/web-search')} style={(s) => ({ margin: 12, marginTop: 8, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: hover(s) })}>
        <Text size={13}>Web search settings</Text>
      </Pressable>
    </View>
  );
}
