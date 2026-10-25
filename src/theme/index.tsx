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

export * from './tokens';

export function useTheme() {
  const system = useColorScheme();
  const { mode, accent, buttonShape, textSize } = useSettings();
  const isDark = mode === 'system' ? system !== 'light' : mode === 'dark';

  return useMemo(() => {
    const base = isDark ? darkColors : lightColors;
    // Snow accent is invisible on a white background: flip it to the text colour.
    const a = !isDark && accent.toUpperCase() === '#ECEDEF' ? '#17181A' : accent;
    const onAccent = a === '#17181A' ? '#FFFFFF' : '#0E0F11';
    const colors: Colors = { ...base, accent: a, onAccent, accentSoft: isDark ? '#2A3220' : '#EEF6DA' };
    return {
      colors,
      isDark,
      body: bodySize[textSize],
      radius: (height: number) => buttonRadius(buttonShape, height),
    };
  }, [isDark, accent, buttonShape, textSize]);
}
