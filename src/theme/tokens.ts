export type Colors = {
  bg: string;
  bgDeep: string;
  surface: string;
  surface2: string;
  selected: string;
  hairline: string;
  border: string;
  text: string;
  text2: string;
  muted: string;
  faint: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  warn: string;
  danger: string;
  scrim: string;
};

export const darkColors: Omit<Colors, 'accent' | 'onAccent' | 'accentSoft'> = {
  bg: '#0E0F11',
  bgDeep: '#08090A',
  surface: '#17191C',
  surface2: '#22252A',
  selected: '#2E3238',
  hairline: '#1E2125',
  border: '#2C3036',
  text: '#ECEDEF',
  text2: '#C9CCD1',
  muted: '#9BA0A8',
  faint: '#6F747C',
  warn: '#FDBA74',
  danger: '#F2A2A2',
  scrim: 'rgba(0,0,0,0.6)',
};

export const lightColors: typeof darkColors = {
  bg: '#FFFFFF',
  bgDeep: '#F4F4F5',
  surface: '#F4F4F5',
  surface2: '#F2F2F3',
  selected: '#E4E4E7',
  hairline: '#ECECEE',
  border: '#E4E4E7',
  text: '#17181A',
  text2: '#3F4348',
  muted: '#5E636B',
  faint: '#9A9FA7',
  warn: '#B45309',
  danger: '#B91C1C',
  scrim: 'rgba(0,0,0,0.4)',
};

export const accents = [
  { id: 'lime', name: 'Lime', value: '#C6F46B' },
  { id: 'sky', name: 'Sky', value: '#7DD3FC' },
  { id: 'peach', name: 'Peach', value: '#FDBA74' },
  { id: 'lilac', name: 'Lilac', value: '#C4B5FD' },
  { id: 'rose', name: 'Rose', value: '#F9A8D4' },
  { id: 'snow', name: 'Snow', value: '#ECEDEF' },
] as const;

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
