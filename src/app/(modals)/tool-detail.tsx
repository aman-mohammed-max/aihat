import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useTheme } from '@/theme';

export default function ToolDetail() {
  const { name, args, result } = useLocalSearchParams<{ name: string; args: string; result: string }>();
  const { colors } = useTheme();
  const pretty = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };
  return (
    <RouteSheet title={name ?? 'Tool call'}>
      <Text size={12} weight="medium" color="muted">Arguments</Text>
      <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 12 }}><Text mono size={12.5}>{pretty(args ?? '') || '—'}</Text></View>
      <Text size={12} weight="medium" color="muted">Result</Text>
      <ScrollView horizontal style={{ backgroundColor: colors.bg, borderRadius: 12 }} contentContainerStyle={{ padding: 12 }}><Text mono size={12.5}>{result || '—'}</Text></ScrollView>
    </RouteSheet>
  );
}
