import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';

import {
  bodySize,
  buttonRadius,
  accentContainer,
  accentForeground,
  darkColors,
  lightColors,
  normalizeAccent,
  type Colors,
} from './tokens';
import { useWallpaperVersion, wallpaperPalette } from './wallpaper';

export * from './tokens';
export { wallpaperColorsAvailable, wallpaperPalette } from './wallpaper';

export function useTheme() {
  const system = useColorScheme();
  const { mode, accent, buttonShape, textSize, materialYou } = useSettings();
  const wallpaperVersion = useWallpaperVersion((s) => s.v);
  const isDark = mode === 'system' ? system !== 'light' : mode === 'dark';

  return useMemo(() => {
    const base = isDark ? darkColors : lightColors;
    // Material You (Android 12+): accent colours from the wallpaper, in the app's own light or dark mode.
    const wall = materialYou ? wallpaperPalette(isDark ? 'dark' : 'light', wallpaperVersion) : null;
    let colors: Colors;
    if (wall) {
      colors = { ...base, accent: wall.primary, onAccent: wall.onPrimary, accentSoft: wall.container };
    } else {
      // Snow accent is invisible on a white background: flip it to the text colour.
      const selected = normalizeAccent(accent);
      const a = !isDark && selected === '#ECEDEF' ? base.text : selected;
      colors = {
        ...base,
        accent: a,
        onAccent: accentForeground(a),
        accentSoft: accentContainer(a, isDark),
      };
    }
    return {
      colors,
      isDark,
      body: bodySize[textSize],
      radius: (height: number) => buttonRadius(buttonShape, height),
    };
  }, [isDark, accent, buttonShape, textSize, materialYou, wallpaperVersion]);
}
