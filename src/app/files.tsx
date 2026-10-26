import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { EndpointRoute, Group, ListRow, Note, Screen, SectionTitle, Segmented, Text } from '@/components';
import { pick } from '@/lib/pick';
import { clearIndex, indexSize } from '@/lib/rag';
import { useSettings, type Settings } from '@/store/settings';
import { useTheme } from '@/theme';
import { device } from '@/lib/device';

export default function Files() {
  const s = useSettings();
  const [size, setSize] = useState({ passages: 0, bytes: 0 });
  useEffect(() => { indexSize().then(setSize); }, []);
  const { colors } = useTheme();
  return (
    <Screen header={{ title: 'Files & documents' }} gap={16}>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>How files reach the model</SectionTitle>
        <Segmented<Settings['fileMode']> options={[{ value: 'whole', label: 'Whole file' }, { value: 'rag', label: 'Search inside' }]} value={s.fileMode} onChange={(fileMode) => s.set({ fileMode })} />
        <Note>{`Search inside splits long text files into passages and sends only the relevant ones. Short files are always sent whole. PDF, Word, PowerPoint, Excel, text, Markdown, CSV and code files are read on the ${device}. Scanned PDFs (pictures of pages) can’t be read; that needs OCR.`}</Note>
      </View>
      {s.fileMode === 'rag' && (
        <View style={{ gap: 8 }}>
          <SectionTitle space={0}>Search inside</SectionTitle>
          <EndpointRoute cap="embeddings" modelLabel="Embedding model" modelPlaceholder="e.g. nomic-embed-text" />
          <Group>
            <ListRow label="Passage size" height={50} value={`${s.chunkSize} tokens`} onPress={() => pick('Passage size', ['400', '800', '1200'], String(s.chunkSize), (v) => s.set({ chunkSize: Number(v) }))} />
            <ListRow label="Passages per question" height={50} value={String(s.topK)} onPress={() => pick('Passages per question', ['3', '5', '6', '8'], String(s.topK), (v) => s.set({ topK: Number(v) }))} />
          </Group>
        </View>
      )}
      <View>
        <SectionTitle>Uploads</SectionTitle>
        <ListRow label="Largest file" height={50} value={`${s.maxFileMb} MB`} onPress={() => pick('Largest file', ['10', '25', '50', '100'], String(s.maxFileMb), (v) => s.set({ maxFileMb: Number(v) }))} />
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>{`Storage on this ${device}`}</SectionTitle>
        <Group>
          <View style={{ minHeight: 52, justifyContent: 'center', gap: 2 }}>
            <Text size={15}>Search index</Text>
            <Text size={12} color="muted">{`${size.passages} passages · ${(size.bytes / 1024 / 1024).toFixed(1)} MB`}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={async () => { await clearIndex(); setSize(await indexSize()); }} style={{ minHeight: 46, justifyContent: 'center' }}>
            <Text size={15} style={{ color: colors.danger }}>Clear the search index</Text>
          </Pressable>
        </Group>
      </View>
    </Screen>
  );
}
