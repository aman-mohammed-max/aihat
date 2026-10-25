import { useMemo } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, ListRow, Screen, SectionTitle } from '@/components';
import { pick } from '@/lib/pick';
import { useLibrary } from '@/store/library';
import { useProviders, isChatModel } from '@/store/providers';
import { useSettings } from '@/store/settings';

const ARCHIVE = [{ value: '0', label: 'Never' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }];

export default function ChatDefaults() {
  const s = useSettings();
  const prompt = useLibrary((x) => x.prompts.find((p) => p.id === s.defaultPromptId));
  const allModels = useProviders((x) => x.models);
  const models = useMemo(() => allModels.filter((m) => m.enabled && isChatModel(m)), [allModels]);
  return (
    <Screen header={{ title: 'Chat defaults' }}>
      <View>
        <SectionTitle>Every new chat starts with</SectionTitle>
        <Card>
          <ListRow label="Model" value={s.defaultModelId ?? 'First available'} onPress={() => router.push('/model-sheet')} />
          <ListRow label="System prompt" value={prompt?.name ?? 'None'} onPress={() => router.push('/prompt-sheet')} />
          <ListRow label="Tools" onPress={() => router.push('/tools-sheet')} />
          <ListRow label="Model settings" value={`Temp ${s.defaultParams.temperature ?? 0.7}`} onPress={() => router.push('/params-sheet')} last />
        </Card>
      </View>
      <View>
        <SectionTitle>Behaviour</SectionTitle>
        <Card>
          <ListRow label="Name chats automatically" toggle={{ on: s.autoTitle, onChange: (autoTitle) => s.set({ autoTitle }) }} />
          <ListRow label="Name chats with" sub="A small, fast model is enough" value={s.titleModelId ?? 'Chat model'} onPress={() => pick('Name chats with', [{ value: '', label: 'Chat model' }, ...models.map((m) => m.id)], s.titleModelId ?? '', (v) => s.set({ titleModelId: v || null }))} />
          <ListRow label="Send with Enter key" toggle={{ on: s.sendWithEnter, onChange: (sendWithEnter) => s.set({ sendWithEnter }) }} />
          <ListRow label="Show tokens and speed" toggle={{ on: s.showStats, onChange: (showStats) => s.set({ showStats }) }} />
          <ListRow label="Show reasoning" toggle={{ on: s.showReasoning, onChange: (showReasoning) => s.set({ showReasoning }) }} />
          <ListRow label="Haptics" toggle={{ on: s.haptics, onChange: (haptics) => s.set({ haptics }) }} last />
        </Card>
      </View>
      <View>
        <SectionTitle>History</SectionTitle>
        <Card>
          <ListRow label="Archive chats older than" value={ARCHIVE.find((a) => a.value === String(s.archiveDays))?.label} onPress={() => pick('Archive chats older than', ARCHIVE, String(s.archiveDays), (v) => s.set({ archiveDays: Number(v) }))} />
          <ListRow label="Temporary chat by default" toggle={{ on: s.tempByDefault, onChange: (tempByDefault) => s.set({ tempByDefault }) }} last />
        </Card>
      </View>
    </Screen>
  );
}
