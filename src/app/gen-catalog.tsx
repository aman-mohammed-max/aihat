import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen, SectionTitle, Text } from '@/components';
import { ACTION_POLICY, catalog } from '@/genui/catalog';
import { useTheme } from '@/theme';

type Def = { description?: string; props?: { shape?: Record<string, { isOptional?: () => boolean; isNullable?: () => boolean }> } };

/** A component's props as the design lists them: `language?, code`. */
const propsOf = (d: Def) =>
  Object.entries(d.props?.shape ?? {})
    .map(([k, v]) => (v.isOptional?.() || v.isNullable?.() ? `${k}?` : k))
    .join(', ');

const SHOWN = 11;

export default function GenCatalog() {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const data = catalog.data as { components: Record<string, Def>; actions: Record<string, Def> };
  const comps = Object.entries(data.components);
  const custom = comps.filter(([k]) => k === 'CodeBlock');
  const standard = comps.filter(([k]) => k !== 'CodeBlock');
  const actions = Object.entries(data.actions);
  const chips = all ? standard : standard.slice(0, SHOWN);
  return (
    <Screen header={{ title: 'Components & actions' }} gap={20}>
      <Text size={13.5} color="muted" style={{ lineHeight: 19.5, paddingHorizontal: 4, paddingBottom: 0 }}>The only components and actions the AI may use. Anything else in a reply is rejected.</Text>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionTitle space={0}>{`Standard · ${standard.length}`}</SectionTitle>
          <Text size={12} color="muted">React Native</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {chips.map(([k]) => (
            <View key={k} style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text mono size={12}>{k}</Text>
            </View>
          ))}
          {standard.length > SHOWN && (
            <Pressable accessibilityRole="button" onPress={() => setAll(!all)} style={{ paddingHorizontal: 4, paddingVertical: 5 }}>
              <Text size={12} color="muted">{all ? 'Show fewer' : `+${standard.length - SHOWN} more`}</Text>
            </Pressable>
          )}
        </View>
      </View>
      <View>
        <SectionTitle space={4}>{`Your components · ${custom.length}`}</SectionTitle>
        {custom.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: i < custom.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text mono size={13.5}>{k}</Text>
              <Text size={12} color="muted">{propsOf(v) || v.description || ''}</Text>
            </View>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
          </View>
        ))}
      </View>
      <View>
        <SectionTitle space={4}>{`Actions · ${actions.length}`}</SectionTitle>
        {actions.map(([k], i) => {
          const policy = ACTION_POLICY[k] ?? 'Auto';
          return (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: i < actions.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
              <Text mono size={13} style={{ flex: 1 }}>{k}</Text>
              <Text size={12} color={policy === 'Always ask' ? 'warn' : 'muted'}>{policy}</Text>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
