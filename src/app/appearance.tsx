import { Pressable, View } from 'react-native';

import { Card, Icon, Screen, SectionTitle, Segmented, Text } from '@/components';
import * as haptic from '@/lib/haptics';
import { useSettings } from '@/store/settings';
import { accents, radii, useTheme, type ButtonShape, type TextSize, type ThemeMode } from '@/theme';

export default function Appearance() {
  const { colors, radius, body } = useTheme();
  const s = useSettings();
  return (
    <Screen header={{ title: 'Appearance' }}>
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ alignSelf: 'flex-end', backgroundColor: colors.surface2, borderRadius: radii.bubble, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text>Summarise this PR</Text>
        </View>
        <Text color="text2">It adds a Drop impl so QMP sockets close when the VM restarts.</Text>
        <View style={{ alignSelf: 'flex-start', height: 38, paddingHorizontal: 18, borderRadius: radius(38), backgroundColor: colors.accent, justifyContent: 'center' }}>
          <Text weight="semi" color="onAccent" size={body - 1}>Send</Text>
        </View>
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle>Theme</SectionTitle>
        <Segmented<ThemeMode> options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} value={s.mode} onChange={(mode) => s.set({ mode })} />
        <Text size={12} color="muted">System follows your phone’s light or dark mode.</Text>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>Accent colour · buttons, switches, links</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {accents.map((a) => (
            <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={a.name} accessibilityState={{ selected: s.accent === a.value }} onPress={() => { haptic.select(); s.set({ accent: a.value }); }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: a.value, alignItems: 'center', justifyContent: 'center', borderWidth: s.accent === a.value ? 3 : 0, borderColor: colors.text }}>
              {s.accent === a.value && <Icon name="check" size={18} color="#0E0F11" />}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>Button shape</SectionTitle>
        <Segmented<ButtonShape> options={[{ value: 'pill', label: 'Pill' }, { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' }]} value={s.buttonShape} onChange={(buttonShape) => s.set({ buttonShape })} />
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>Text size</SectionTitle>
        <Segmented<TextSize> options={[{ value: 'small', label: 'Small' }, { value: 'default', label: 'Default' }, { value: 'large', label: 'Large' }]} value={s.textSize} onChange={(textSize) => s.set({ textSize })} />
      </View>
    </Screen>
  );
}
