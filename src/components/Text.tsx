import { Text as RNText, type TextProps } from 'react-native';

import { fonts, useTheme } from '@/theme';

type Props = TextProps & {
  color?: 'text' | 'text2' | 'muted' | 'faint' | 'accent' | 'warn' | 'danger' | 'onAccent';
  size?: number;
  weight?: 'regular' | 'medium' | 'semi';
  mono?: boolean;
};

const family = { regular: fonts.ui, medium: fonts.uiMedium, semi: fonts.uiSemi };

export function Text({ color = 'text', size, weight = 'regular', mono, style, ...rest }: Props) {
  const { colors, body } = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        {
          color: colors[color],
          fontSize: size ?? body,
          fontFamily: mono ? (weight === 'regular' ? fonts.mono : fonts.monoMedium) : family[weight],
        },
        style,
      ]}
    />
  );
}
