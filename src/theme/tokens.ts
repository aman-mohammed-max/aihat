export type Colors = {
  bg: string;
  bgDeep: string;
  surface: string;
  surface2: string;
  selected: string;
  hairline: string;
  border: string;
  /** Outline of a text field. */
  field: string;
  text: string;
  text2: string;
  muted: string;
  faint: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  warn: string;
  danger: string;
  /** Background and text of a warning box ("Includes a script…"). */
  warnSoft: string;
  onWarnSoft: string;
  /** Background and text of an error box ("The server rejected this key"). */
  dangerSoft: string;
  onDangerSoft: string;
  scrim: string;
  /** The handle at the top of a bottom sheet. */
  grabber: string;
};

export const darkColors: Omit<Colors, 'accent' | 'onAccent' | 'accentSoft'> = {
  bg: '#0E0F11',
  bgDeep: '#08090A',
  surface: '#17191C',
  surface2: '#22252A',
  selected: '#2E3238',
  hairline: '#1E2125',
  border: '#2C3036',
  field: '#26292E',
  text: '#ECEDEF',
  text2: '#C9CCD1',
  muted: '#9BA0A8',
  faint: '#6F747C',
  warn: '#FDBA74',
  danger: '#F2A2A2',
  warnSoft: '#2A2219',
  onWarnSoft: '#F4D9BC',
  dangerSoft: '#2E1E1E',
  onDangerSoft: '#F7D4D4',
  scrim: 'rgba(0,0,0,0.6)',
  grabber: '#3A3F46',
};

export const lightColors: typeof darkColors = {
  bg: '#FFFFFF',
  bgDeep: '#F4F4F5',
  surface: '#F4F4F5',
  surface2: '#F2F2F3',
  selected: '#E4E4E7',
  hairline: '#ECECEE',
  border: '#E4E4E7',
  field: '#E4E4E7',
  text: '#17181A',
  text2: '#3F4348',
  muted: '#5E636B',
  faint: '#9A9FA7',
  warn: '#B45309',
  danger: '#B91C1C',
  warnSoft: '#FFF4E6',
  onWarnSoft: '#7C3A0B',
  dangerSoft: '#FDECEC',
  onDangerSoft: '#7F1D1D',
  scrim: 'rgba(0,0,0,0.4)',
  grabber: '#D4D4D8',
};

export const accents = [
  { id: 'lime', name: 'Lime', value: '#C6F46B' },
  { id: 'sky', name: 'Sky', value: '#7DD3FC' },
  { id: 'peach', name: 'Peach', value: '#FDBA74' },
  { id: 'lilac', name: 'Lilac', value: '#C4B5FD' },
  { id: 'rose', name: 'Rose', value: '#F9A8D4' },
  { id: 'snow', name: 'Snow', value: '#ECEDEF' },
] as const;

export const defaultAccent = accents[0].value;

/** Keep custom or legacy settings from feeding invalid color strings into native styles. */
export function normalizeAccent(value: string) {
  return /^#[\da-f]{6}$/i.test(value) ? value.toUpperCase() : defaultAccent;
}

/** A low contrast tint for chips and selected states, derived from the active accent. */
export function accentContainer(accent: string, isDark: boolean) {
  const tint = normalizeAccent(accent).slice(1);
  const base = isDark ? '#0E0F11' : '#FFFFFF';
  const mix = isDark ? 0.16 : 0.14;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(tint.slice(offset, offset + 2), 16);
    const neutral = Number.parseInt(base.slice(offset + 1, offset + 3), 16);
    return Math.round(neutral + (value - neutral) * mix).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`.toUpperCase();
}

/** Choose readable foreground text for the current accent, including older custom values. */
export function accentForeground(accent: string) {
  const hex = normalizeAccent(accent).slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0E0F11' : '#FFFFFF';
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type ButtonShape = 'pill' | 'rounded' | 'square';
export type TextSize = 'small' | 'default' | 'large';

export const radii = { input: 12, card: 16, bubble: 18, sheet: 28, dialog: 24, composer: 24 };
export const space = { screen: 16, row: 50, sectionGap: 20 };
export const bodySize: Record<TextSize, number> = { small: 13, default: 15, large: 16.5 };
export const fonts = {
  ui: 'Geist_400Regular',
  uiMedium: 'Geist_500Medium',
  uiSemi: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
};
export const buttonRadius = (shape: ButtonShape, height: number) =>
  shape === 'pill' ? height / 2 : shape === 'rounded' ? 9 : 3;
