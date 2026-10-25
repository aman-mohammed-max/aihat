import { KeyboardAvoidingView, ScrollView, View } from 'react-native';

import { useKeyboardVisible } from '@/lib/keyboard';
import { useTheme } from '@/theme';

import { SectionTitle } from './Controls';
import { Header } from './Header';

type HeaderProps = React.ComponentProps<typeof Header>;

/** Stack page: Header + scrolling body (+ optional pinned footer). */
export function Screen({ header, children, footer, scroll = true }: { header: HeaderProps; children: React.ReactNode; footer?: React.ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const keyboard = useKeyboardVisible();
  return (
    <KeyboardAvoidingView behavior={'padding'} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header left="back" {...header} />
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 32 }}>{children}</ScrollView>
      ) : (
        <View style={{ flex: 1, padding: 16, gap: 22 }}>{children}</View>
      )}
      {footer ? <View style={{ padding: 16, paddingBottom: keyboard ? 12 : 28, flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export const Section = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <View>
    {title ? <SectionTitle>{title}</SectionTitle> : null}
    {children}
  </View>
);
