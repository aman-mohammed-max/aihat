import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button, Card, ListRow, Screen, Text } from '@/components';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useProviders, type Provider } from '@/store/providers';
import { useTheme } from '@/theme';

const dot = { online: '#86EFAC', offline: '#FDBA74', rejected: '#F2A2A2', unknown: '#6F747C' } as const;
const label = (p: Provider, n: number) =>
  p.status === 'rejected' ? 'Key rejected' : p.status === 'offline' ? 'Offline' : p.status === 'online' ? `${n} models` : 'Not tested';

export default function Providers() {
  const { colors } = useTheme();
  const { providers, models } = useProviders();
  const refresh = useRefreshModels();
  return (
    <Screen header={{ title: 'Providers', right: 'add', addLabel: 'Add endpoint', onAdd: () => router.push('/add-provider') }} footer={<Button label="Add endpoint" flex onPress={() => router.push('/add-provider')} />}>
      {providers.length > 0 && (
        <Card>
          <ListRow icon="refresh" label="Refresh all models" sub="Fetch every endpoint's model list again" value={refresh.busy ? 'Fetching…' : refresh.note || undefined} onPress={refresh.run} last />
        </Card>
      )}
      {providers.length === 0 && <Text color="muted">No endpoints yet. Add an OpenAI-compatible server to start chatting.</Text>}
      <Card>
        {providers.map((p, i) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/provider-detail', params: { id: p.id } })} style={{ minHeight: 64, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === providers.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Text weight="semi" size={12}>{p.name.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text weight="medium">{p.name}</Text>
                {p.isDefault && <Text size={10.5} weight="medium" color="accent">DEFAULT</Text>}
              </View>
              <Text mono size={12} color="muted" numberOfLines={1}>{p.baseUrl.replace(/^https?:\/\//, '')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot[p.status] }} />
                <Text size={12.5} color="text2">{label(p, models.filter((m) => m.providerId === p.id).length)}</Text>
              </View>
              {p.latencyMs ? <Text mono size={11.5} color="muted">{p.latencyMs} ms</Text> : null}
            </View>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
