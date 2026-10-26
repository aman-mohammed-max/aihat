import { Children, createContext, useContext } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import * as haptic from '@/lib/haptics';
import { radii, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Toggle } from './Toggle';

/** The small grey heading over a group of rows (12 px, medium, 4 px in). `space` is the gap below it. */
export function SectionTitle({ children, space = 2 }: { children: string; space?: number }) {
  return (
    <Text size={12} weight="medium" color="muted" style={{ paddingLeft: 4, paddingBottom: space }}>
      {children}
    </Text>
  );
}

/** A group of rows, laid straight on the page as the design draws it: no box behind, no lines between. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}>{children}</View>;
}

/** Set by sheets: a group inside a sheet is filled with the page colour instead of the sheet's. */
export const OnSheet = createContext(false);

/** Rows in a filled box with hairlines between them (the design's grouped settings, 14 px corners). */
export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const onSheet = useContext(OnSheet);
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: onSheet ? colors.bg : colors.surface, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 2 }, style]}>
      {rows.map((row, i) => (
        <View key={i} style={i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.hairline } : undefined}>{row}</View>
      ))}
    </View>
  );
}

/** A small grey note under a section (12 px, 4 px in). */
export function Note({ children, color = 'muted' }: { children: React.ReactNode; color?: 'muted' | 'accent' | 'warn' }) {
  return <Text size={12} color={color} style={{ lineHeight: 17, paddingHorizontal: 4 }}>{children}</Text>;
}

/** A small accent link on its own line ("Type a model name instead"). */
export function LinkRow({ label, onPress, color = 'accent' }: { label: string; onPress: () => void; color?: 'accent' | 'text2' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
      <Text size={13} color={color}>{label}</Text>
    </Pressable>
  );
}

/** A tinted box for a warning or an error, with an optional icon in front. */
export function Banner({ tone, icon, children }: { tone: 'warn' | 'danger'; icon?: IconName; children: React.ReactNode }) {
  const { colors } = useTheme();
  const fg = tone === 'warn' ? colors.onWarnSoft : colors.onDangerSoft;
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: tone === 'warn' ? colors.warnSoft : colors.dangerSoft, borderRadius: tone === 'warn' ? 12 : 14, paddingVertical: tone === 'warn' ? 10 : 12, paddingHorizontal: tone === 'warn' ? 12 : 14 }}>
      {icon ? <Icon name={icon} size={16} color={tone === 'warn' ? colors.warn : colors.danger} /> : null}
      <Text size={tone === 'warn' ? 12.5 : 13} style={{ flex: 1, lineHeight: tone === 'warn' ? 18 : 19, color: fg }}>{children}</Text>
    </View>
  );
}

/** The small outlined button at the end of a row ("Connect"). */
export function RowButton({ label, onPress }: { label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} hitSlop={6} style={({ pressed }) => ({ height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text size={13}>{label}</Text>
    </Pressable>
  );
}

/** A filled box of links to other pages: an icon, a title and a line under it, and a chevron (Browse skills, Connectors). */
export function LinkCard({ items }: { items: { icon: IconName; label: string; sub: string; onPress: () => void }[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <Pressable key={it.label} accessibilityRole="button" accessibilityLabel={`${it.label}. ${it.sub}`} onPress={it.onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, opacity: pressed ? 0.7 : 1, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: colors.hairline })}>
          <Icon name={it.icon} size={20} color={colors.text} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text size={15} weight="medium">{it.label}</Text>
            <Text size={12.5} color="muted">{it.sub}</Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * One thing you added (a skill, a server): its name in the code font with a line under it, and a switch or a button.
 * `dot` puts a status dot in front: filled when it's working, a ring when it needs attention.
 */
export function ThingRow({ name, sub, subTone, onPress, toggle, action, dot, divider = true, padding = 12 }: {
  name: string;
  sub?: string;
  subTone?: 'muted' | 'warn';
  onPress?: () => void;
  toggle?: { on: boolean; onChange: (v: boolean) => void };
  action?: { label: string; onPress: () => void };
  dot?: 'on' | 'attention';
  divider?: boolean;
  padding?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, borderBottomWidth: divider ? 1 : 0, borderBottomColor: colors.hairline }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot === 'on' ? colors.accent : 'transparent', borderWidth: dot === 'on' ? 0 : 1.5, borderColor: colors.warn }} /> : null}
      <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 3, paddingVertical: padding, opacity: pressed ? 0.7 : 1 })}>
        <Text mono size={14} numberOfLines={1}>{name}</Text>
        {sub ? <Text size={12.5} color={subTone ?? 'muted'} numberOfLines={2}>{sub}</Text> : null}
      </Pressable>
      {toggle ? <Toggle on={toggle.on} onChange={toggle.onChange} label={name} /> : action ? <RowButton label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

/** A filled box with hairlines between its rows (16 px corners); use PanelRow inside. */
export function Panel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>
      {rows.map((row, i) => (
        <View key={i} style={i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.hairline } : undefined}>{row}</View>
      ))}
    </View>
  );
}

/** A row in a Panel, 14 px in: a label (and a line under it), and a value, a switch or a chevron on the right. */
export function PanelRow({ label, sub, value, mono, monoValue, onPress, toggle, height = 48 }: {
  label: string;
  sub?: string;
  value?: string;
  /** The label in the code font (a file name). */
  mono?: boolean;
  monoValue?: boolean;
  onPress?: () => void;
  toggle?: { on: boolean; onChange: (v: boolean) => void };
  height?: number;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text size={mono ? 13 : 15} mono={mono} numberOfLines={mono ? 1 : 2}>{label}</Text>
        {sub ? <Text size={12} color="muted">{sub}</Text> : null}
      </View>
      {toggle ? (
        <Toggle on={toggle.on} onChange={toggle.onChange} label={label} />
      ) : value ? (
        <Text size={13} mono={monoValue} color="muted" numberOfLines={2} style={{ maxWidth: 200, textAlign: 'right' }}>{value}</Text>
      ) : null}
      {onPress && !toggle ? <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} /> : null}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: sub ? Math.max(height, 52) : height, paddingHorizontal: 14, paddingVertical: sub ? 6 : 0 };
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>{body}</Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

/** A filled box with an icon, a title and a line under it ("Added", "Sign-in: your browser"). */
export function InfoBox({ icon, title, sub, tone = 'text' }: { icon: IconName; title: string; sub?: string; tone?: 'text' | 'accent' | 'danger' }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14 }}>
      <Icon name={icon} size={18} color={tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.text2} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text size={15} color={tone === 'danger' ? 'danger' : 'text'}>{title}</Text>
        {sub ? <Text size={12.5} color="muted" style={{ lineHeight: 17.5 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** A filled panel, for the few things the design puts in a box: previews, results, notes. */
export function Box({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: colors.surface, borderRadius: radii.card, paddingHorizontal: 14, paddingVertical: 4 }, style]}>{children}</View>;
}

/** The 40 px rounded square in front of a row: an icon, or a couple of letters. */
export function Tile({ icon, text, size = 40 }: { icon?: IconName; text?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      {icon ? <Icon name={icon} size={19} color={colors.text} /> : <Text mono size={13}>{text}</Text>}
    </View>
  );
}

type RowProps = {
  label: string;
  icon?: IconName;
  value?: string;
  sub?: string;
  onPress?: () => void;
  /** Toggle row: replaces value + chevron. */
  toggle?: { on: boolean; onChange: (v: boolean) => void };
  danger?: boolean;
  /** Kept for older call sites; rows have no lines between them unless `divider` is set. */
  last?: boolean;
  /** The label in the code font (model ids, file names). */
  mono?: boolean;
  /** The value in the code font (a model id). */
  monoValue?: boolean;
  /** Row height; the design uses 48 for most lists, 42 on the Settings index. */
  height?: number;
  /** A hairline under the row (lists of things, like endpoints or models). */
  divider?: boolean;
  /** Hide the chevron on a row that does something in place. */
  chevron?: boolean;
};

/** One row of a list: icon, label (and a line under it), a value or a switch, and a chevron when it opens something. */
export function ListRow({ label, icon, value, sub, onPress, toggle, danger, mono, monoValue, height = 48, divider, chevron = true }: RowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={toggle ? undefined : 'button'}
      accessibilityLabel={value && !toggle ? `${label}, ${value}` : label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed && onPress ? 0.7 : 1,
        minHeight: height,
        paddingHorizontal: 4,
        paddingVertical: sub ? 6 : 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.hairline,
      })}>
      {icon ? <Icon name={icon} size={19} color={danger ? colors.danger : colors.muted} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text color={danger ? 'danger' : 'text'} numberOfLines={2} mono={mono} size={mono ? 13.5 : undefined}>{label}</Text>
        {sub ? <Text size={12} color="muted" style={{ lineHeight: 16 }}>{sub}</Text> : null}
      </View>
      {toggle ? (
        <Toggle on={toggle.on} onChange={toggle.onChange} label={label} />
      ) : (
        <>
          {value ? <Text size={monoValue ? 12.5 : 13} mono={monoValue} color="muted" numberOfLines={1} style={{ maxWidth: 180 }}>{value}</Text> : null}
          {onPress && chevron ? <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} /> : null}
        </>
      )}
    </Pressable>
  );
}

type SegmentedProps<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void };

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const { colors } = useTheme();
  const onSheet = useContext(OnSheet);
  return (
    <View style={{ flexDirection: 'row', gap: 4, backgroundColor: onSheet ? colors.bg : colors.surface, borderRadius: radii.input, padding: 4 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            onPress={() => { if (!sel) haptic.select(); onChange(o.value); }}
            style={{ flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? colors.selected : 'transparent' }}>
            <Text size={13.5} weight={sel ? 'medium' : 'regular'} color={sel ? 'text' : 'muted'}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => { haptic.select(); onPress?.(); }}
      hitSlop={6}
      style={{
        height: 32,
        borderRadius: 16,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: selected ? colors.text : 'transparent',
        borderWidth: selected ? 0 : 1,
        borderColor: colors.border,
      }}>
      {icon ? <Icon name={icon} size={14} color={selected ? colors.bg : colors.text2} /> : null}
      <Text size={13} weight={selected ? 'medium' : 'regular'} color={selected ? 'onAccent' : 'text2'} style={selected ? { color: colors.bg } : undefined}>{label}</Text>
    </Pressable>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  /** `dangerFill`: a filled red button, for the confirm button of a destructive dialog. */
  variant?: 'primary' | 'outline' | 'danger' | 'dangerFill';
  height?: number;
  flex?: boolean;
  disabled?: boolean;
  /** The label size; most buttons use 15, small outline ones 14. */
  textSize?: number;
};

/** Pill buttons as in the design: accent with dark text, or a thin outline (red text for a destructive one). */
export function Button({ label, onPress, variant = 'primary', height = 46, flex, disabled, textSize = 15 }: ButtonProps) {
  const { colors, radius, isDark } = useTheme();
  const filled = variant === 'primary' || variant === 'dangerFill';
  const bg = variant === 'primary' ? colors.accent : variant === 'dangerFill' ? colors.danger : 'transparent';
  const fg = variant === 'primary' ? 'onAccent' : variant === 'danger' ? 'danger' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { if (variant === 'danger' || variant === 'dangerFill') haptic.warning(); else haptic.tap(); onPress?.(); }}
      style={({ pressed }) => ({
        height,
        minWidth: 44,
        flex: flex ? 1 : undefined,
        paddingHorizontal: 20,
        borderRadius: radius(height),
        backgroundColor: bg,
        borderWidth: filled ? 0 : 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      <Text size={textSize} weight={filled ? 'semi' : 'regular'} color={fg} style={variant === 'dangerFill' ? { color: isDark ? '#2A0E0E' : '#FFFFFF' } : undefined}>{label}</Text>
    </Pressable>
  );
}
