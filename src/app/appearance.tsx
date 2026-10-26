import { Pressable, View } from 'react-native';

import { Screen, SectionTitle, Segmented, Text, Toggle } from '@/components';
import { device } from '@/lib/device';
import * as haptic from '@/lib/haptics';
import { useSettings } from '@/store/settings';
import { accents, useTheme, wallpaperColorsAvailable, wallpaperPalette, type ButtonShape, type TextSize, type ThemeMode } from '@/theme';

const PREVIEW_SIZE: Record<TextSize, number> = { small: 13, default: 14.5, large: 16.5 };
const PREVIEW_BUTTON: Record<ButtonShape, number> = { pill: 16, rounded: 9, square: 3 };

export default function Appearance() {
  const { colors, isDark } = useTheme();
  const s = useSettings();
  // Material You exists on Android 12 and later only; on iPhone the option isn't shown.
  const canWallpaper = wallpaperColorsAvailable();
  const fromWallpaper = canWallpaper && s.materialYou;
  const wall = canWallpaper ? wallpaperPalette(isDark ? 'dark' : 'light') : null;

  return (
    <Screen header={{ title: 'Appearance' }} gap={20}>
      {/* How a reply looks with these settings. */}
      <View style={{ borderRadius: 20, padding: 16, gap: 10, backgroundColor: isDark ? '#131518' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#26292E' : '#E4E4E7' }}>
        <View style={{ alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: isDark ? colors.surface2 : '#F2F2F3', borderRadius: s.buttonShape === 'square' ? 6 : 16 }}>
          <Text size={13}>Summarise this PR</Text>
        </View>
        <Text size={PREVIEW_SIZE[s.textSize]} style={{ lineHeight: PREVIEW_SIZE[s.textSize] * 1.5 }}>It adds a Drop impl so QMP sockets close when the VM restarts.</Text>
        <View style={{ alignSelf: 'flex-end', height: 32, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: colors.accent, borderRadius: PREVIEW_BUTTON[s.buttonShape] }}>
          <Text size={13} weight="semi" color="onAccent">Send</Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Theme</SectionTitle>
        <Segmented<ThemeMode> options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} value={s.mode} onChange={(mode) => s.set({ mode })} />
        <Text size={12} color="muted" style={{ paddingLeft: 4 }}>{`System follows your ${device}’s light or dark mode.`}</Text>
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle space={0}>Accent colour · buttons, switches, links</SectionTitle>
        {canWallpaper && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={15}>Colours from your wallpaper</Text>
              <Text size={12} color="muted">Material You: follows your Android wallpaper</Text>
            </View>
            {wall ? (
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[wall.primary, wall.container, wall.onPrimary].map((c, i) => <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />)}
              </View>
            ) : null}
            <Toggle on={s.materialYou} onChange={(materialYou) => s.set({ materialYou })} label="Colours from your wallpaper" />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 12, paddingLeft: 2, opacity: fromWallpaper ? 0.4 : 1 }}>
          {accents.map((a) => {
            const on = !fromWallpaper && s.accent === a.value;
            return (
              // Picking a colour also stops following the wallpaper. The chosen one has a ring around it.
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={a.name}
                accessibilityState={{ selected: on }}
                onPress={() => { haptic.select(); s.set({ accent: a.value, materialYou: false }); }}
                style={{ width: 44, height: 44, borderRadius: 22, borderWidth: on ? 3 : 0, borderColor: a.value, padding: on ? 2 : 0 }}>
                <View style={{ flex: 1, borderRadius: 22, backgroundColor: a.value }} />
              </Pressable>
            );
          })}
        </View>
        {fromWallpaper && <Text size={12} color="muted" style={{ paddingLeft: 4 }}>Using your wallpaper’s colours. Pick a colour to use it instead.</Text>}
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Button shape</SectionTitle>
        <Segmented<ButtonShape> options={[{ value: 'pill', label: 'Pill' }, { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' }]} value={s.buttonShape} onChange={(buttonShape) => s.set({ buttonShape })} />
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Text size</SectionTitle>
        <Segmented<TextSize> options={[{ value: 'small', label: 'Small' }, { value: 'default', label: 'Default' }, { value: 'large', label: 'Large' }]} value={s.textSize} onChange={(textSize) => s.set({ textSize })} />
      </View>
    </Screen>
  );
}
