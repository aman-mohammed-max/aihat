import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, SearchBar, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useChats } from '@/store/chats';
import { isChatModel, useProviders, type Provider } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

/** The provider's status dot: filled when it answers, a ring when it doesn't. */
function Dot({ status }: { status: Provider['status'] }) {
  const { colors } = useTheme();
  const ring = status === 'offline' ? colors.warn : status === 'rejected' ? colors.danger : null;
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: ring ? 'transparent' : status === 'online' ? colors.accent : colors.faint, borderWidth: ring ? 1.5 : 0, borderColor: ring ?? undefined }} />;
}

export default function ModelSheet() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const { colors } = useTheme();
  const { providers, models } = useProviders();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const defaults = useSettings();
  const [q, setQ] = useState('');
  const refresh = useRefreshModels();
  const current = chat?.modelId ?? defaults.defaultModelId;
  const chatModels = models.filter((m) => m.enabled && isChatModel(m));

  const pick = (providerId: string, modelId: string) => {
    if (chatId) {
      // Switching model brings that model's own default settings with it.
      const m = models.find((x) => x.providerId === providerId && x.id === modelId);
      useChats.getState().patch(chatId, { providerId, modelId, params: { ...chat?.params, ...(m?.defaults ?? {}) } });
    } else defaults.set({ defaultProviderId: providerId, defaultModelId: modelId });
    router.back();
  };

  return (
    <RouteSheet
      title="Choose model"
      popover
      footerLine
      footer={[
        { label: 'Model settings', onPress: () => router.replace({ pathname: '/params-sheet', params: { chatId } }) },
        { label: 'Manage providers', onPress: () => router.replace('/providers') },
      ]}>
      <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${chatModels.length} models`} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, marginTop: -6 }}>
        <Text size={12.5} color="muted" style={{ flex: 1 }} numberOfLines={2}>{refresh.busy ? 'Fetching models…' : refresh.note || `${chatModels.length} models`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh models" disabled={refresh.busy} onPress={refresh.run} style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.border, opacity: refresh.busy ? 0.5 : 1 }}>
          <Icon name="refresh" size={16} color={colors.text} />
          <Text size={13}>Refresh</Text>
        </Pressable>
      </View>
      {providers.length === 0 && <Text color="muted" style={{ paddingHorizontal: 4 }}>No endpoints yet. Add one in Manage providers.</Text>}
      <View>
        {providers.map((p, pi) => {
          const list = chatModels.filter((m) => m.providerId === p.id && `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase()));
          const all = chatModels.filter((m) => m.providerId === p.id).length;
          return (
            <View key={p.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: pi === 0 ? 4 : 14, paddingBottom: 4, paddingHorizontal: 4, minHeight: 32 }}>
                <Dot status={p.status} />
                <Text size={12} weight="medium" color="muted" style={{ flex: 1 }} numberOfLines={1}>{p.name}</Text>
                {p.status === 'offline' || p.status === 'rejected' ? (
                  <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.replace({ pathname: '/provider-detail', params: { id: p.id } })}>
                    <Text size={12} color="warn">{p.status === 'rejected' ? 'Key rejected · fix' : 'Offline · why?'}</Text>
                  </Pressable>
                ) : (
                  <Text size={12} color="muted">{p.latencyMs ? `${p.latencyMs} ms` : `${all} models`}</Text>
                )}
              </View>
              {list.map((m) => {
                const isDefault = defaults.defaultProviderId === p.id && defaults.defaultModelId === m.id;
                const caps = [m.caps.vision && 'Vision', m.caps.tools && 'Tools', m.caps.contextK && `${m.caps.contextK}k context`, isDefault && 'Default'].filter(Boolean).join(' · ');
                const on = m.id === current && (chat ? chat.providerId === p.id : defaults.defaultProviderId === p.id);
                return (
                  <Pressable key={m.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(p.id, m.id)} style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 4, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text mono size={14} numberOfLines={1}>{m.name}</Text>
                      <Text size={12} color="muted">{caps || 'Chat model'}</Text>
                    </View>
                    {on ? <Icon name="check" size={18} color={colors.accent} strokeWidth={2} /> : null}
                  </Pressable>
                );
              })}
              {q && list.length === 0 ? <Text size={13} color="muted" style={{ paddingHorizontal: 4, paddingVertical: 8 }}>No matches here.</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/model-edit', params: { providerId: p.id } })} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text size={13} color="accent">{`Add a custom model to ${p.name}`}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </RouteSheet>
  );
}
