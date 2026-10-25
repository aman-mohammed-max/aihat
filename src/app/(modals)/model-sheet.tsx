import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, SearchBar, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useChats } from '@/store/chats';
import { isChatModel, useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

const dot = { online: '#86EFAC', offline: '#FDBA74', rejected: '#F2A2A2', unknown: '#6F747C' } as const;

export default function ModelSheet() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const { colors } = useTheme();
  const { providers, models } = useProviders();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const defaults = useSettings();
  const [q, setQ] = useState('');
  const refresh = useRefreshModels();
  const current = chat?.modelId ?? defaults.defaultModelId;

  const pick = (providerId: string, modelId: string) => {
    if (chatId) useChats.getState().patch(chatId, { providerId, modelId });
    else defaults.set({ defaultProviderId: providerId, defaultModelId: modelId });
    router.back();
  };

  return (
    <RouteSheet
      title="Choose model"
      popover
      footer={[
        { label: 'Model settings', onPress: () => router.replace({ pathname: '/params-sheet', params: { chatId } }) },
        { label: 'Manage providers', onPress: () => router.replace('/providers') },
      ]}>
      <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${models.filter(isChatModel).length} models`} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text size={12.5} color="muted" style={{ flex: 1 }} numberOfLines={2}>{refresh.busy ? 'Fetching models…' : refresh.note || 'Not showing a new model? Refresh the list.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh models" disabled={refresh.busy} onPress={refresh.run} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.border, opacity: refresh.busy ? 0.5 : 1 }}>
          <Icon name="refresh" size={16} color={colors.text} />
          <Text size={13}>Refresh</Text>
        </Pressable>
      </View>
      {providers.length === 0 && <Text color="muted">No endpoints yet. Add one in Manage providers.</Text>}
      {providers.map((p) => {
        const list = models.filter((m) => m.providerId === p.id && m.enabled && isChatModel(m) && m.id.toLowerCase().includes(q.toLowerCase()));
        return (
          <View key={p.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot[p.status] }} />
              <Text size={12} weight="medium" color="muted" style={{ flex: 1 }}>{p.name}</Text>
              {p.status === 'offline' || p.status === 'rejected' ? (
                <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/provider-detail', params: { id: p.id } })} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text size={12} color="warn">{p.status === 'rejected' ? 'Key rejected · fix' : 'Offline · why?'}</Text>
                </Pressable>
              ) : (
                <Text size={12} color="muted">{p.latencyMs ? `${p.latencyMs} ms` : `${list.length} models`}</Text>
              )}
            </View>
            <View style={{ backgroundColor: colors.bg, borderRadius: 14, overflow: 'hidden' }}>
              {list.map((m, i) => (
                <Pressable key={m.id} accessibilityRole="button" onPress={() => pick(p.id, m.id)} style={{ minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
                  <View style={{ flex: 1 }}>
                    <Text mono size={14}>{m.name}</Text>
                    <Text size={12} color="muted">{[m.caps.vision && 'Vision', m.caps.tools && 'Tools', m.caps.embeddings && 'Embeddings', m.caps.contextK && `${m.caps.contextK}k`].filter(Boolean).join(' · ') || 'Chat model'}</Text>
                  </View>
                  {m.id === current && <Icon name="check" size={18} color={colors.accent} />}
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/model-edit', params: { providerId: p.id } })} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text size={13} color="accent">Add a custom model to {p.name}</Text>
            </Pressable>
          </View>
        );
      })}
    </RouteSheet>
  );
}
