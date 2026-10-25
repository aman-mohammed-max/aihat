import Slider from '@react-native-community/slider';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, ListRow, Segmented, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import type { Params } from '@/api/openai';
import { useChats } from '@/store/chats';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

function Row({ label, value, min, max, step, onChange, ends }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; ends?: [string, string] }) {
  const { colors } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text>{label}</Text>
        <Text mono size={13} color="muted">{value.toLocaleString()}</Text>
      </View>
      <Slider accessibilityLabel={label} minimumValue={min} maximumValue={max} step={step} value={value} onValueChange={onChange} minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.border} thumbTintColor={colors.accent} style={{ height: 44 }} />
      {ends && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text size={11.5} color="muted">{ends[0]}</Text>
          <Text size={11.5} color="muted">{ends[1]}</Text>
        </View>
      )}
    </View>
  );
}

export default function ParamsSheet() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const defaults = useSettings();
  const params: Params = { ...defaults.defaultParams, ...(chat?.params ?? {}) };
  const set = (p: Partial<Params>) => {
    if (chatId) useChats.getState().patch(chatId, { params: { ...chat?.params, ...p } });
    else defaults.set({ defaultParams: { ...defaults.defaultParams, ...p } });
  };

  return (
    <RouteSheet title="Model settings">
      <Row label="Temperature" value={params.temperature ?? 0.7} min={0} max={2} step={0.1} onChange={(v) => set({ temperature: Math.round(v * 10) / 10 })} ends={['Precise', 'Creative']} />
      <Row label="Max reply length (tok)" value={params.maxTokens ?? 4096} min={256} max={32768} step={256} onChange={(v) => set({ maxTokens: v })} />
      <Row label="Top P" value={params.topP ?? 0.95} min={0} max={1} step={0.05} onChange={(v) => set({ topP: Math.round(v * 100) / 100 })} />
      <View style={{ gap: 8 }}>
        <Text>Reasoning</Text>
        <Segmented options={[{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} value={params.reasoning ?? 'off'} onChange={(reasoning) => set({ reasoning })} />
      </View>
      <Card>
        <ListRow label="Stream replies" sub="Show words as they arrive" toggle={{ on: params.stream !== false, onChange: (stream) => set({ stream }) }} last />
      </Card>
      <Button label="Reset to defaults" variant="outline" onPress={() => (chatId ? useChats.getState().patch(chatId, { params: {} }) : defaults.set({ defaultParams: { temperature: 0.7, maxTokens: 4096, topP: 0.95, reasoning: 'off', stream: true } }))} />
    </RouteSheet>
  );
}
