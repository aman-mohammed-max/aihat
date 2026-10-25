import { useBoundProp, type ComponentRegistry, type ComponentRenderProps } from '@json-render/react-native';
import { Pressable, ScrollView, Switch as RNSwitch, TextInput as RNTextInput, View } from 'react-native';

import { Text } from '@/components/Text';
import { fonts, radii, useTheme } from '@/theme';

type P<T = Record<string, unknown>> = ComponentRenderProps<T>;
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : d);

/** Themed versions of the standard components so generated UI follows tokens (no one-off colours). */
const components = {
  // Containers keep their layout props but never take a model-chosen background: the theme decides.
  Container: ({ element, children }: P) => {
    const p = element.props as { padding?: number; paddingHorizontal?: number; paddingVertical?: number; margin?: number; borderRadius?: number; flex?: number };
    return <View style={{ padding: p.padding, paddingHorizontal: p.paddingHorizontal, paddingVertical: p.paddingVertical, margin: p.margin, flex: p.flex }}>{children}</View>;
  },
  Card: ({ element, children }: P) => {
    const { colors } = useTheme();
    const { title, subtitle } = element.props as { title?: string; subtitle?: string };
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 12 }}>
        {title ? (
          <View>
            <Text size={16} weight="semi">{title}</Text>
            {subtitle ? <Text size={12.5} color="muted">{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </View>
    );
  },
  Heading: ({ element }: P) => {
    const p = element.props as { text?: string; level?: number };
    return <Text size={[28, 24, 20, 18, 16, 15][Math.min(Math.max((p.level ?? 2) - 1, 0), 5)]} weight="semi">{str(p.text)}</Text>;
  },
  Paragraph: ({ element }: P) => <Text color="text2" style={{ lineHeight: 22 }}>{str((element.props as { text?: string }).text)}</Text>,
  Label: ({ element }: P) => {
    const p = element.props as { text?: string; bold?: boolean };
    return <Text size={12.5} color="muted" weight={p.bold ? 'medium' : 'regular'}>{str(p.text)}</Text>;
  },
  Badge: ({ element }: P) => {
    const { colors } = useTheme();
    return (
      <View style={{ alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.surface2 }}>
        <Text size={11.5} color="text2">{str((element.props as { label?: string }).label)}</Text>
      </View>
    );
  },
  Chip: ({ element, emit }: P) => {
    const { colors } = useTheme();
    const p = element.props as { label?: string; selected?: boolean };
    return (
      <Pressable accessibilityRole="button" onPress={() => emit('press')} style={{ height: 32, minWidth: 44, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: p.selected ? colors.text : 'transparent', borderWidth: p.selected ? 0 : 1, borderColor: colors.border }}>
        <Text size={13} style={{ color: p.selected ? colors.bg : colors.text2 }}>{str(p.label)}</Text>
      </Pressable>
    );
  },
  Button: ({ element, emit }: P) => {
    const { colors, radius } = useTheme();
    const p = element.props as { label?: string; variant?: string; disabled?: boolean };
    const primary = p.variant !== 'secondary' && p.variant !== 'outline';
    return (
      <Pressable accessibilityRole="button" disabled={p.disabled} onPress={() => emit('press')} style={{ height: 44, paddingHorizontal: 18, borderRadius: radius(44), alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? colors.accent : 'transparent', borderWidth: primary ? 0 : 1, borderColor: colors.border, opacity: p.disabled ? 0.5 : 1 }}>
        <Text weight="semi" color={primary ? 'onAccent' : 'text'}>{str(p.label)}</Text>
      </Pressable>
    );
  },
  ProgressBar: ({ element }: P) => {
    const { colors } = useTheme();
    const progress = Math.min(Math.max(num((element.props as { progress?: number }).progress), 0), 1);
    return (
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' }}>
        <View style={{ width: `${progress * 100}%`, height: 6, backgroundColor: colors.accent }} />
      </View>
    );
  },
  Divider: () => {
    const { colors } = useTheme();
    return <View style={{ height: 1, backgroundColor: colors.hairline }} />;
  },
  ListItem: ({ element }: P) => {
    const p = element.props as { title?: string; subtitle?: string; trailing?: string };
    return (
      <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text>{str(p.title)}</Text>
          {p.subtitle ? <Text size={12.5} color="muted">{p.subtitle}</Text> : null}
        </View>
        {p.trailing ? <Text size={13} color="muted">{p.trailing}</Text> : null}
      </View>
    );
  },
  Switch: ({ element, bindings }: P) => {
    const { colors } = useTheme();
    const p = element.props as { checked?: boolean; label?: string };
    const [value, setValue] = useBoundProp<boolean>(p.checked, bindings?.checked);
    return (
      <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text>{str(p.label)}</Text>
        <RNSwitch accessibilityLabel={p.label} value={!!value} onValueChange={setValue} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={value ? colors.onAccent : colors.muted} />
      </View>
    );
  },
  TextInput: ({ element, bindings }: P) => {
    const { colors, body } = useTheme();
    const p = element.props as { placeholder?: string; value?: string; label?: string; secureTextEntry?: boolean; multiline?: boolean };
    const [value, setValue] = useBoundProp<string>(p.value, bindings?.value);
    return (
      <View style={{ gap: 6 }}>
        {p.label ? <Text size={12.5} color="muted">{p.label}</Text> : null}
        <RNTextInput accessibilityLabel={p.label ?? p.placeholder} value={value ?? ''} onChangeText={setValue} placeholder={p.placeholder} placeholderTextColor={colors.faint} secureTextEntry={p.secureTextEntry} multiline={p.multiline} style={{ minHeight: 46, borderRadius: radii.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.ui, fontSize: body }} />
      </View>
    );
  },
  CodeBlock: ({ element }: P) => {
    const { colors } = useTheme();
    return (
      <ScrollView horizontal style={{ backgroundColor: colors.bg, borderRadius: 12 }} contentContainerStyle={{ padding: 12 }}>
        <Text mono size={12.5}>{str((element.props as { code?: string }).code)}</Text>
      </ScrollView>
    );
  },
};

/**
 * Plain element-style registry: the Renderer calls each component with `{ element, children, emit, bindings }`.
 * (Not `defineRegistry`, which would call them with `{ props, … }` instead.) These override the library's standard components.
 */
export const registry = components as unknown as ComponentRegistry;
