import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { fonts, radii, useTheme } from '@/theme';

import { Text } from './Text';

type Props = {
  label: string;
  hint?: string;
  /** Values like addresses and ids show in the code font. */
  mono?: boolean;
  /** Draws the outline red (a key the server turned down). */
  error?: boolean;
  /** Something beside the field, like a Paste button. */
  aside?: React.ReactNode;
} & React.ComponentProps<typeof TextInput>;

/** A labelled text field as in the design: 46 px, 12 px corners, a thin outline that lights up while you type. */
export function Field({ label, hint, mono, error, aside, ...props }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const input = (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={colors.faint}
      selectionColor={props.selectionColor ?? colors.accent}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        {
          height: 46,
          flex: aside ? 1 : undefined,
          minWidth: 0,
          borderRadius: radii.input,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: error ? colors.danger : focused ? colors.accent : colors.field,
          paddingHorizontal: 12,
          color: colors.text,
          fontFamily: mono ? fonts.mono : fonts.ui,
          fontSize: mono ? 13.5 : props.secureTextEntry ? 14 : 15,
        },
        props.style,
      ]}
    />
  );
  return (
    <View style={{ gap: 6 }}>
      <Text size={12} weight="medium" color="muted" style={{ paddingLeft: 4 }}>{label}</Text>
      {aside ? <View style={{ flexDirection: 'row', gap: 8 }}>{input}{aside}</View> : input}
      {hint ? <Text size={12} color="muted" style={{ paddingLeft: 4 }}>{hint}</Text> : null}
    </View>
  );
}
