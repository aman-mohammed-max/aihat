import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Card, EndpointRoute, ListRow, Screen, SectionTitle, Segmented, Text } from '@/components';
import { pick } from '@/lib/pick';
import { clearIndex, indexSize } from '@/lib/rag';
import { useSettings, type Settings } from '@/store/settings';
import { device } from '@/lib/device';

export default function Files() {
  const s = useSettings();
  const [size, setSize] = useState({ passages: 0, bytes: 0 });
  useEffect(() => { indexSize().then(setSize); }, []);
  return (
    <Screen header={{ title: 'Files & documents' }}>
      <View style={{ gap: 8 }}>
        <SectionTitle>How files reach the model</SectionTitle>
        <Segmented<Settings['fileMode']> options={[{ value: 'whole', label: 'Whole file' }, { value: 'rag', label: 'Search inside' }]} value={s.fileMode} onChange={(fileMode) => s.set({ fileMode })} />
        <Text size={12} color="muted">Search inside splits long text files into passages and sends only the relevant ones. Short files are always sent whole. PDF, Word, PowerPoint, Excel, text, Markdown, CSV and code files can be read. Scanned PDFs (pictures of pages) can’t, because that needs OCR.</Text>
      </View>
      {s.fileMode === 'rag' && (
        <View style={{ gap: 12 }}>
          <SectionTitle>Search inside</SectionTitle>
          <EndpointRoute cap="embeddings" modelLabel="Embedding model" modelPlaceholder="e.g. nomic-embed-text" hint="Calls POST /v1/embeddings on the endpoint you pick." />
          <Card>
            <ListRow label="Passage size" value={`${s.chunkSize} tokens`} onPress={() => pick('Passage size', ['400', '800', '1200'], String(s.chunkSize), (v) => s.set({ chunkSize: Number(v) }))} />
            <ListRow label="Passages per question" value={String(s.topK)} onPress={() => pick('Passages per question', ['3', '5', '6', '8'], String(s.topK), (v) => s.set({ topK: Number(v) }))} last />
          </Card>
        </View>
      )}
      <View>
        <SectionTitle>Uploads</SectionTitle>
        <Card>
          <ListRow label="Largest file" value={`${s.maxFileMb} MB`} onPress={() => pick('Largest file', ['10', '25', '50', '100'], String(s.maxFileMb), (v) => s.set({ maxFileMb: Number(v) }))} last />
        </Card>
      </View>
      <View>
        <SectionTitle>{`Storage on this ${device}`}</SectionTitle>
        <Card>
          <ListRow label="Search index" sub={`${size.passages} passages · ${(size.bytes / 1024 / 1024).toFixed(1)} MB`} />
          <ListRow label="Clear the search index" danger onPress={async () => { await clearIndex(); setSize(await indexSize()); }} last />
        </Card>
      </View>
    </Screen>
  );
}
