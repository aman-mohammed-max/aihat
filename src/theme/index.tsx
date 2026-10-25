import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';

import {
  bodySize,
  buttonRadius,
  darkColors,
  lightColors,
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
      const a = !isDark && accent.toUpperCase() === '#ECEDEF' ? '#17181A' : accent;
      const onAccent = a === '#17181A' ? '#FFFFFF' : '#0E0F11';
      colors = { ...base, accent: a, onAccent, accentSoft: isDark ? '#2A3220' : '#EEF6DA' };
    }
    return {
      colors,
      isDark,
      body: bodySize[textSize],
      radius: (height: number) => buttonRadius(buttonShape, height),
    };
  }, [isDark, accent, buttonShape, textSize, materialYou, wallpaperVersion]);
}
