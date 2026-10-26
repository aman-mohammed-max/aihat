import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, SearchBar, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import * as haptic from '@/lib/haptics';
import { usePicker } from '@/store/picker';
import { useTheme } from '@/theme';

export default function Picker() {
  const { colors } = useTheme();
  const { title, options, selected, searchable, onPick } = usePicker();
  const [q, setQ] = useState('');
  const list = options.filter((o) => `${o.label} ${o.note ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <RouteSheet title={title}>
      {searchable && <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${title.toLowerCase()}`} />}
      <View accessibilityRole="radiogroup" accessibilityLabel={title}>
        {list.map((o, i) => (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: o.value === selected }}
            onPress={() => { haptic.select(); router.back(); setTimeout(() => onPick?.(o.value), 60); }}
            style={({ pressed }) => ({ minHeight: 50, paddingHorizontal: 4, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1, borderBottomWidth: i < list.length - 1 ? 1 : 0, borderBottomColor: colors.surface2 })}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={15}>{o.label}</Text>
              {o.note ? <Text size={12} color="muted">{o.note}</Text> : null}
            </View>
            {o.value === selected && <Icon name="check" size={18} color={colors.accent} strokeWidth={2} />}
          </Pressable>
        ))}
        {list.length === 0 && <Text size={13.5} color="muted" style={{ paddingHorizontal: 4, paddingVertical: 12 }}>No matches.</Text>}
      </View>
    </RouteSheet>
  );
}
