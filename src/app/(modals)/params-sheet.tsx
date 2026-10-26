import Slider from '@react-native-community/slider';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ListRow, Note, Segmented, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import type { Params } from '@/api/openai';
import { useChats } from '@/store/chats';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

const BUILT_IN: Params = { temperature: 0.7, maxTokens: 4096, topP: 0.95, reasoning: 'off', stream: true };

function Row({ label, value, shown, min, max, step, onChange, ends }: { label: string; value: number; shown: string; min: number; max: number; step: number; onChange: (v: number) => void; ends?: [string, string] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text size={15}>{label}</Text>
        <Text mono size={13} color="text2">{shown}</Text>
      </View>
      <Slider accessibilityLabel={label} minimumValue={min} maximumValue={max} step={step} value={value} onValueChange={onChange} minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.border} thumbTintColor={colors.accent} style={{ height: 28, marginHorizontal: -4 }} />
      {ends && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text size={11.5} color="muted">{ends[0]}</Text>
          <Text size={11.5} color="muted">{ends[1]}</Text>
        </View>
      )}
    </View>
  );
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export default function ParamsSheet() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const { colors } = useTheme();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const messages = useChats((s) => (chatId ? s.messages[chatId] : undefined));
  const model = useProviders((s) => s.models.find((m) => m.providerId === chat?.providerId && m.id === chat?.modelId));
  const defaults = useSettings();
  const [scope, setScope] = useState<'chat' | 'model'>('chat');
  const forModel = !!chat && !!model && scope === 'model';
  const params: Params = forModel ? { ...defaults.defaultParams, ...model!.defaults } : { ...defaults.defaultParams, ...(chat?.params ?? {}) };

  const set = (p: Partial<Params>) => {
    if (forModel) useProviders.getState().setModelDefaults(model!.providerId, model!.id, { ...model!.defaults, ...p });
    else if (chatId) useChats.getState().patch(chatId, { params: { ...chat?.params, ...p } });
    else defaults.set({ defaultParams: { ...defaults.defaultParams, ...p } });
  };
  const reset = () => {
    if (forModel) useProviders.getState().setModelDefaults(model!.providerId, model!.id, {});
    else if (chatId) useChats.getState().patch(chatId, { params: { ...defaults.defaultParams, ...(model?.defaults ?? {}) } });
    else defaults.set({ defaultParams: BUILT_IN });
  };

  // About four characters per token: a rough count of what the chat sends.
  const used = Math.round((messages ?? []).reduce((n, m) => n + m.content.length + m.attachments.reduce((a, f) => a + (f.text?.length ?? 0), 0), 0) / 4);
  const ctxWindow = model?.caps.contextK ? model.caps.contextK * 1000 : 0;

  return (
    <RouteSheet
      title="Model settings"
      sub={chat?.modelId ?? 'For new chats'}
      footer={[{ label: chatId && !forModel ? 'Reset to provider defaults' : 'Reset to app defaults', onPress: reset }]}>
      <View style={{ gap: 18, paddingHorizontal: 4, paddingTop: 6 }}>
        {chat && model ? (
          <Segmented<'chat' | 'model'> options={[{ value: 'chat', label: 'This chat' }, { value: 'model', label: 'Default for model' }]} value={scope} onChange={setScope} />
        ) : null}
        <Row label="Temperature" value={params.temperature ?? 0.7} shown={String(params.temperature ?? 0.7)} min={0} max={2} step={0.1} onChange={(v) => set({ temperature: Math.round(v * 10) / 10 })} ends={['Precise', 'Creative']} />
        <Row label="Max reply length" value={params.maxTokens ?? 4096} shown={`${(params.maxTokens ?? 4096).toLocaleString('en-US')} tok`} min={256} max={32768} step={256} onChange={(v) => set({ maxTokens: v })} />
        <Row label="Top P" value={params.topP ?? 0.95} shown={String(params.topP ?? 0.95)} min={0} max={1} step={0.05} onChange={(v) => set({ topP: Math.round(v * 100) / 100 })} />
        <View style={{ gap: 8 }}>
          <Text size={15}>Reasoning</Text>
          <Segmented options={[{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} value={params.reasoning ?? 'off'} onChange={(reasoning) => set({ reasoning })} />
          <Text size={12} color="muted">Also /effort low, /effort high in the chat box. Models without reasoning ignore it.</Text>
        </View>
        <View style={{ marginHorizontal: -4 }}>
          <ListRow label="Stream replies" sub="Show words as they arrive" height={44} toggle={{ on: params.stream !== false, onChange: (stream) => set({ stream }) }} />
        </View>
        {chat && !forModel ? (
          ctxWindow ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text size={13} color="muted">Context used</Text>
                <Text mono size={13} color="text2">{`${k(used)} / ${k(ctxWindow)}`}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }}>
                <View style={{ width: `${Math.min(100, Math.max(1, (used / ctxWindow) * 100))}%`, height: 6, borderRadius: 3, backgroundColor: used > ctxWindow * 0.85 ? colors.warn : colors.accent }} />
              </View>
            </View>
          ) : (
            <Note>{`About ${k(used)} tokens in this chat so far. The model doesn’t say how much it can read at once.`}</Note>
          )
        ) : null}
        {forModel ? <Note>{`New chats with ${model!.name} start with these settings.`}</Note> : null}
      </View>
    </RouteSheet>
  );
}
