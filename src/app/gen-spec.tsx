import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { validateSpec } from '@json-render/core';

import { Card, Chip, ListRow, Screen, Text } from '@/components';
import { useTheme } from '@/theme';

type El = { type: string; children?: string[] };

export default function GenSpec() {
  const { spec } = useLocalSearchParams<{ spec: string }>();
  const { colors } = useTheme();
  const [tab, setTab] = useState<'JSON' | 'Tree'>('JSON');
  const parsed = useMemo(() => { try { return JSON.parse(spec); } catch { return null; } }, [spec]);
  const valid = parsed ? validateSpec(parsed).valid : false;
  const walk = (id: string, depth = 0): { id: string; type: string; depth: number }[] => {
    const el: El | undefined = parsed?.elements?.[id];
    return el ? [{ id, type: el.type, depth }, ...(el.children ?? []).flatMap((c) => walk(c, depth + 1))] : [];
  };
  return (
    <Screen header={{ title: 'UI spec' }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>{(['JSON', 'Tree'] as const).map((t) => <Chip key={t} label={t} selected={tab === t} onPress={() => setTab(t)} />)}</View>
      <Text size={13} color={valid ? 'accent' : 'danger'}>{valid ? 'Valid for catalog' : 'Invalid spec'} · {Object.keys(parsed?.elements ?? {}).length} elements · {(spec?.length ?? 0) / 1000 | 0}.{(((spec?.length ?? 0) % 1000) / 100) | 0} KB</Text>
      {tab === 'JSON' ? (
        <ScrollView horizontal style={{ backgroundColor: colors.surface, borderRadius: 12 }} contentContainerStyle={{ padding: 12 }}>
          <Text mono size={12}>{parsed ? JSON.stringify(parsed, null, 2) : spec}</Text>
        </ScrollView>
      ) : (
        <Card>{parsed ? walk(parsed.root).map((n, i, a) => <ListRow key={n.id + i} label={`${'  '.repeat(n.depth)}${n.type}`} value={n.id} last={i === a.length - 1} />) : null}</Card>
      )}
    </Screen>
  );
}
