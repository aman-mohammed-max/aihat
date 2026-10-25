import { TextInput, View } from 'react-native';

import { fonts, radii, useTheme } from '@/theme';

import { Text } from './Text';

export function Field({ label, hint, ...props }: { label: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  const { colors, body } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text size={12.5} weight="medium" color="muted">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[{ height: 46, borderRadius: radii.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.ui, fontSize: body }, props.style]}
      />
      {hint ? <Text size={12} color="muted">{hint}</Text> : null}
    </View>
  );
}
