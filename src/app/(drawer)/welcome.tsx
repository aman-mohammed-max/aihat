import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text, type IconName } from '@/components';
import { useLayout } from '@/lib/layout';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

const OPTIONS: { icon: IconName; title: string; sub: string; path: string }[] = [
  { icon: 'server', title: 'Add an endpoint', sub: 'vLLM, LM Studio, Ollama, OpenRouter, Groq…', path: '/add-provider' },
  { icon: 'refresh', title: 'Restore a backup', sub: 'From Google Drive, iCloud or a .json file', path: '/backup' },
];

export default function Welcome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const go = (path: string) => {
    useSettings.getState().set({ welcomed: true });
    router.push(path as never);
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + (wide ? 96 : 56), paddingHorizontal: 20, paddingBottom: insets.bottom + 20, width: '100%', maxWidth: wide ? 560 : undefined, alignSelf: 'center' }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="logo" size={28} color={colors.onAccent} />
      </View>
      <Text size={30} weight="semi" style={{ marginTop: 28 }}>Chat with any model, on your terms</Text>
      <Text color="muted" style={{ marginTop: 10 }}>Connect an OpenAI-compatible endpoint, or restore a backup from another device.</Text>
      <View style={{ marginTop: 28, gap: 10 }}>
        {OPTIONS.map((o) => (
          <Pressable key={o.title} accessibilityRole="button" onPress={() => go(o.path)} style={{ minHeight: 64, backgroundColor: colors.surface, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={o.icon} size={20} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text weight="medium">{o.title}</Text>
              <Text size={12.5} color="muted">{o.sub}</Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.faint} />
          </Pressable>
        ))}
      </View>
      <View style={{ flex: wide ? 0 : 1, height: wide ? 32 : undefined }} />
      <Button label="Get started" onPress={() => go('/add-provider')} height={52} />
      <Pressable accessibilityRole="button" onPress={() => { useSettings.getState().set({ welcomed: true }); router.replace('/'); }} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
        <Text color="muted">Skip for now</Text>
      </Pressable>
      <Text size={12.5} color="muted" style={{ textAlign: 'center', marginTop: 12 }}>No account needed. Keys stay on this device.</Text>
    </View>
  );
}
