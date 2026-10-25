import { TextInput, View } from 'react-native';

import { fonts, radii, useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
};

export function SearchBar({ value, onChangeText, placeholder = 'Search', hint, autoFocus }: Props) {
  const { colors, body } = useTheme();
  return (
    <View style={{ height: 44, borderRadius: radii.input, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name="search" size={17} color={colors.muted} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoFocus={autoFocus}
        style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: body, fontFamily: fonts.ui }}
      />
      {hint ? <Text size={12} color="muted">{hint}</Text> : null}
    </View>
  );
}
