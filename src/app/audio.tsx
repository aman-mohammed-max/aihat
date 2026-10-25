import { View } from 'react-native';

import { listVoices } from '@/api/openai';
import { Card, EndpointRoute, ListRow, Screen, SectionTitle, Text } from '@/components';
import { resolveRoute } from '@/lib/endpoints';
import { pick } from '@/lib/pick';
import { speak } from '@/lib/tts';
import { useSettings, type Settings } from '@/store/settings';

const LANGS = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Arabic', 'Portuguese', 'Russian', 'Korean', 'Italian', 'Tamil', 'Bengali', 'Urdu'];

// OpenAI's built-in voices; used when the server has no voice list of its own.
const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

export default function Audio() {
  const s = useSettings();
  const chooseVoice = async () => {
    const { provider } = resolveRoute('speech');
    const fetched = provider ? await listVoices(provider) : null;
    pick('Voice', [{ value: '', label: 'Server default' }, ...(fetched ?? OPENAI_VOICES).map((v) => ({ value: v, label: v, note: fetched ? undefined : 'OpenAI voice' }))], s.ttsVoice, (ttsVoice) => s.set({ ttsVoice }));
  };
  return (
    <Screen header={{ title: 'Voice & speech' }}>
      <View style={{ gap: 12 }}>
        <SectionTitle>Speech to text</SectionTitle>
        <EndpointRoute cap="transcription" modelPlaceholder="whisper-1" hint="Calls POST /v1/audio/transcriptions on the endpoint you pick." />
      </View>
      <View>
        <SectionTitle>Translation</SectionTitle>
        <Card>
          <ListRow label="Translate into" value={s.translateTo} onPress={() => pick('Translate into', LANGS, s.translateTo, (v) => s.set({ translateTo: v }))} last />
        </Card>
      </View>
      <View style={{ gap: 12 }}>
        <SectionTitle>Text to speech</SectionTitle>
        <Card>
          <ListRow label="Voice engine" value={s.ttsEngine === 'device' ? 'This phone' : 'My endpoint'} onPress={() => pick('Voice engine', [{ value: 'device', label: 'This phone', note: 'Works offline' }, { value: 'endpoint', label: 'My endpoint', note: 'POST /v1/audio/speech' }], s.ttsEngine, (v) => s.set({ ttsEngine: v as Settings['ttsEngine'] }))} />
          <ListRow label="Play a sample" icon="speaker" onPress={() => speak('This is how replies will sound.').catch((e) => alert(e.message))} />
          <ListRow label="Read replies aloud" toggle={{ on: s.autoReadAloud, onChange: (autoReadAloud) => s.set({ autoReadAloud }) }} last />
        </Card>
        {s.ttsEngine === 'endpoint' && (
          <>
            <EndpointRoute cap="speech" modelPlaceholder="tts-1" />
            <Card>
              <ListRow label="Voice" value={s.ttsVoice || 'Server default'} onPress={chooseVoice} last />
            </Card>
            <Text size={12} color="muted">The list comes from the endpoint (GET /audio/voices) when it has one; otherwise OpenAI’s standard voices are shown.</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
