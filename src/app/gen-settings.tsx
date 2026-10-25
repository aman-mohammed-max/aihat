import { useMemo } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, ListRow, Screen, SectionTitle, Segmented, Text } from '@/components';
import { pick } from '@/lib/pick';
import { useProviders, isChatModel } from '@/store/providers';
import { useSettings, type Settings } from '@/store/settings';

export default function GenSettings() {
  const s = useSettings();
  const allModels = useProviders((x) => x.models);
  const models = useMemo(() => allModels.filter((m) => m.enabled && isChatModel(m)), [allModels]);
  const toggleModel = (id: string, on: boolean) =>
    s.set({ genUiDisabledModels: on ? s.genUiDisabledModels.filter((x) => x !== id) : [...s.genUiDisabledModels, id] });
  return (
    <Screen header={{ title: 'Generative UI' }}>
      <Card><ListRow label="Let replies include UI" sub="Cards, forms and small apps drawn with this app's own components" toggle={{ on: s.genUi, onChange: (genUi) => s.set({ genUi }) }} last /></Card>
      <View style={{ gap: 8 }}>
        <SectionTitle>When the assistant may build a UI</SectionTitle>
        <Segmented<Settings['genUiMode']> options={[{ value: 'auto', label: 'When I ask' }, { value: 'always', label: 'Always' }, { value: 'chip', label: 'UI chip only' }]} value={s.genUiMode} onChange={(genUiMode) => s.set({ genUiMode })} />
        <Text size={12} color="muted">The UI instructions are long, so they are only sent when needed. “When I ask” sends them for messages like “make a checklist” or “build a form”. Turn on the UI chip (＋ → Build a UI) to force it for one message.</Text>
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle>Where it can appear</SectionTitle>
        <Segmented<Settings['genUiScope']> options={[{ value: 'chat', label: 'In chat only' }, { value: 'apps', label: 'Chat + full-screen apps' }]} value={s.genUiScope} onChange={(genUiScope) => s.set({ genUiScope })} />
      </View>
      <View>
        <SectionTitle>Per model</SectionTitle>
        <Card>
          {models.length === 0 && <ListRow label="Add a provider first" last />}
          {models.slice(0, 30).map((m, i) => (
            <ListRow key={m.id} mono label={m.name} sub={m.caps.structured === 'structuredOutput' ? 'Structured output' : m.caps.structured === 'jsonMode' ? 'JSON mode' : 'Prompt only'} toggle={{ on: !s.genUiDisabledModels.includes(m.id), onChange: (on) => toggleModel(m.id, on) }} last={i === Math.min(models.length, 30) - 1} />
          ))}
        </Card>
      </View>
      <Card>
        <ListRow label="Components & actions" onPress={() => router.push('/gen-catalog')} />
        <ListRow label="If the UI is invalid" value={s.genUiInvalid === 'text' ? 'Show as text' : 'Ask the model to retry'} onPress={() => pick('If the UI is invalid', [{ value: 'text', label: 'Show as text' }, { value: 'retry', label: 'Ask the model to retry' }], s.genUiInvalid, (v) => s.set({ genUiInvalid: v as Settings['genUiInvalid'] }))} />
        <ListRow label="Confirm actions that write data" toggle={{ on: s.genUiConfirmWrites, onChange: (genUiConfirmWrites) => s.set({ genUiConfirmWrites }) }} />
        <ListRow label="Show “View spec” (developer)" toggle={{ on: s.developerMode, onChange: (developerMode) => s.set({ developerMode }) }} last />
      </Card>
    </Screen>
  );
}
