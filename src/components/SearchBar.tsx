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
  /** Called when the keyboard's search / go key is pressed. */
  onSubmit?: () => void;
  keyboardType?: 'default' | 'url';
};

export function SearchBar({ value, onChangeText, placeholder = 'Search', hint, autoFocus, onSubmit, keyboardType }: Props) {
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
        selectionColor={colors.accent}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: body, fontFamily: fonts.ui }}
      />
      {hint ? <Text size={12} color="muted">{hint}</Text> : null}
    </View>
  );
}
