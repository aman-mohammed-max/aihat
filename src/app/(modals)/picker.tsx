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
  return (
    <RouteSheet title={title}>
      {searchable && <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${title.toLowerCase()}`} />}
      <View accessibilityRole="radiogroup">
        {options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).map((o) => (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: o.value === selected }} onPress={() => { haptic.select(); router.back(); setTimeout(() => onPick?.(o.value), 60); }} style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text>{o.label}</Text>
              {o.note ? <Text size={12.5} color="muted">{o.note}</Text> : null}
            </View>
            {o.value === selected && <Icon name="check" size={18} color={colors.accent} />}
          </Pressable>
        ))}
      </View>
    </RouteSheet>
  );
}
