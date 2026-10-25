import { Pressable, View, type ViewStyle } from 'react-native';

import * as haptic from '@/lib/haptics';
import { radii, space, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Toggle } from './Toggle';

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text size={12} weight="medium" color="muted" style={{ paddingLeft: 4, paddingBottom: 8 }}>
      {children}
    </Text>
  );
}

/** Grouped card of rows (rounded 16 `surface`, hairline dividers). */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: colors.surface, borderRadius: radii.card, overflow: 'hidden' }, style]}>{children}</View>;
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
  last?: boolean;
  mono?: boolean;
};

export function ListRow({ label, icon, value, sub, onPress, toggle, danger, last, mono }: RowProps) {
  const { colors } = useTheme();
  const tint = danger ? 'danger' : 'text';
  return (
    <Pressable
      accessibilityRole={toggle ? undefined : 'button'}
      accessibilityLabel={value && !toggle ? `${label}, ${value}` : label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed && onPress ? 0.7 : 1,
        minHeight: space.row,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hairline,
      })}>
      {icon ? <Icon name={icon} size={19} color={danger ? colors.danger : colors.muted} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text color={tint} numberOfLines={1} mono={mono}>{label}</Text>
        {sub ? <Text size={12.5} color="muted" numberOfLines={2}>{sub}</Text> : null}
      </View>
      {toggle ? (
        <Toggle on={toggle.on} onChange={toggle.onChange} label={label} />
      ) : (
        <>
          {value ? <Text size={13} color="muted" numberOfLines={1} style={{ maxWidth: 160 }}>{value}</Text> : null}
          {onPress ? <Icon name="chevronRight" size={16} color={colors.faint} /> : null}
        </>
      )}
    </Pressable>
  );
}

type SegmentedProps<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void };

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.input, padding: 4 }}>
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
      <Text size={13} color={selected ? 'onAccent' : 'text2'} style={selected ? { color: colors.bg } : undefined}>{label}</Text>
    </Pressable>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'danger';
  height?: number;
  flex?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', height = 46, flex, disabled }: ButtonProps) {
  const { colors, radius } = useTheme();
  const bg = variant === 'primary' ? colors.accent : 'transparent';
  const fg = variant === 'primary' ? 'onAccent' : variant === 'danger' ? 'danger' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { if (variant === 'danger') haptic.warning(); else haptic.tap(); onPress?.(); }}
      style={({ pressed }) => ({
        height,
        minWidth: 44,
        flex: flex ? 1 : undefined,
        paddingHorizontal: 20,
        borderRadius: radius(height),
        backgroundColor: bg,
        borderWidth: variant === 'primary' ? 0 : 1,
        borderColor: variant === 'danger' ? colors.danger : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      <Text weight="semi" color={fg}>{label}</Text>
    </Pressable>
  );
}
