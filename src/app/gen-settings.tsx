import { useMemo } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { ListRow, Note, Screen, SectionTitle, Segmented, Text, Toggle } from '@/components';
import { pick } from '@/lib/pick';
import { useProviders, isChatModel } from '@/store/providers';
import { useSettings, type Settings } from '@/store/settings';
import { useTheme } from '@/theme';

export default function GenSettings() {
  const { colors } = useTheme();
  const s = useSettings();
  const allModels = useProviders((x) => x.models);
  const models = useMemo(() => allModels.filter((m) => m.enabled && isChatModel(m)), [allModels]);
  const toggleModel = (id: string, on: boolean) =>
    s.set({ genUiDisabledModels: on ? s.genUiDisabledModels.filter((x) => x !== id) : [...s.genUiDisabledModels, id] });
  return (
    <Screen header={{ title: 'Generative UI' }} gap={20}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.surface, marginTop: 6 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text size={15} weight="medium">Let replies include UI</Text>
          <Text size={12.5} color="muted" style={{ lineHeight: 17.5 }}>Cards, forms and small apps drawn with this app’s own components</Text>
        </View>
        <Toggle on={s.genUi} onChange={(genUi) => s.set({ genUi })} label="Generative UI" />
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>When the assistant may build a UI</SectionTitle>
        <Segmented<Settings['genUiMode']> options={[{ value: 'auto', label: 'When I ask' }, { value: 'always', label: 'Always' }, { value: 'chip', label: 'UI chip only' }]} value={s.genUiMode} onChange={(genUiMode) => s.set({ genUiMode })} />
        <Note>The UI instructions are long, so they are only sent when needed. “When I ask” sends them for messages like “make a checklist”. The UI chip (+ then Build a UI) forces it for one message.</Note>
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Where it can appear</SectionTitle>
        <Segmented<Settings['genUiScope']> options={[{ value: 'chat', label: 'In chat only' }, { value: 'apps', label: 'Chat + full-screen apps' }]} value={s.genUiScope} onChange={(genUiScope) => s.set({ genUiScope })} />
      </View>
      <View>
        <SectionTitle space={4}>Per model</SectionTitle>
        {models.length === 0 && <ListRow label="Add a provider first" height={46} />}
        {models.slice(0, 30).map((m) => (
          <View key={m.id} style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
            <Text mono size={13.5} numberOfLines={1} style={{ flex: 1 }}>{m.name}</Text>
            <Text size={12} color="muted">{m.caps.structured === 'structuredOutput' ? 'Structured output' : m.caps.structured === 'jsonMode' ? 'JSON mode' : 'Prompt only'}</Text>
            <Toggle on={!s.genUiDisabledModels.includes(m.id)} onChange={(on) => toggleModel(m.id, on)} label={m.name} />
          </View>
        ))}
      </View>
      <View>
        <ListRow label="Components & actions" height={46} onPress={() => router.push('/gen-catalog')} />
        <ListRow label="If the UI is invalid" height={46} value={s.genUiInvalid === 'text' ? 'Show as text' : 'Ask the model to retry'} onPress={() => pick('If the UI is invalid', [{ value: 'text', label: 'Show as text' }, { value: 'retry', label: 'Ask the model to retry' }], s.genUiInvalid, (v) => s.set({ genUiInvalid: v as Settings['genUiInvalid'] }))} />
        <ListRow label="Confirm actions that write data" height={46} toggle={{ on: s.genUiConfirmWrites, onChange: (genUiConfirmWrites) => s.set({ genUiConfirmWrites }) }} />
        <ListRow label="Show “View spec” (developer)" height={46} toggle={{ on: s.developerMode, onChange: (developerMode) => s.set({ developerMode }) }} />
      </View>
    </Screen>
  );
}
