import { usePathname } from 'expo-router';
import { KeyboardAvoidingView, ScrollView, View, type ViewStyle } from 'react-native';

import { useKeyboardVisible } from '@/lib/keyboard';
import { COLUMN, useLayout } from '@/lib/layout';
import { useTheme } from '@/theme';

import { AppShell } from './AppNav';
import { SectionTitle } from './Controls';
import { Header } from './Header';
import { SETTINGS_GROUPS, SETTINGS_PAGES, SettingsShell } from './SettingsNav';

type HeaderProps = React.ComponentProps<typeof Header>;

/** Pages you reach straight from the side menu or the settings list: no Back button beside those on a big screen. */
const MENU_PAGES = new Set(['/prompts', '/skills', '/mcp', '/connectors', '/market', '/gen-app', ...SETTINGS_GROUPS.flatMap((g) => g.rows.map((r) => r.path))]);

/** On a tablet or computer: the app menu, or the settings list, beside the page. */
export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return SETTINGS_PAGES.has(pathname) ? <SettingsShell>{children}</SettingsShell> : <AppShell>{children}</AppShell>;
}

/** Keeps a page to a readable width on big screens. */
export function useColumn(maxWidth = COLUMN): ViewStyle | null {
  const { wide } = useLayout();
  return wide ? { width: '100%', maxWidth, alignSelf: 'center' } : null;
}

/** Stack page: Header + scrolling body (+ optional pinned footer). */
export function Screen({ header, children, footer, scroll = true, maxWidth }: { header: HeaderProps; children: React.ReactNode; footer?: React.ReactNode; scroll?: boolean; /** Wider than the reading column (a grid of cards). */ maxWidth?: number }) {
  const { colors } = useTheme();
  const keyboard = useKeyboardVisible();
  const { wide } = useLayout();
  const pathname = usePathname();
  const column = useColumn(maxWidth);
  const pad = wide ? 24 : 16;
  return (
    <PageShell>
      <KeyboardAvoidingView behavior={'padding'} style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header left={wide && MENU_PAGES.has(pathname) ? 'none' : 'back'} {...header} />
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: pad, gap: 22, paddingBottom: 32 }, column]}>{children}</ScrollView>
        ) : (
          <View style={[{ flex: 1, padding: pad, gap: 22 }, column]}>{children}</View>
        )}
        {footer ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
            <View style={[{ padding: 16, paddingBottom: keyboard ? 12 : 28, flexDirection: 'row', gap: 10 }, column]}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </PageShell>
  );
}

export const Section = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <View>
    {title ? <SectionTitle>{title}</SectionTitle> : null}
    {children}
  </View>
);
