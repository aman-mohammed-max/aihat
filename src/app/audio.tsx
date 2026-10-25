import { View } from 'react-native';

import { listVoices } from '@/api/openai';
import { Card, EndpointRoute, ListRow, Screen, SectionTitle, Text } from '@/components';
import { resolveRoute } from '@/lib/endpoints';
import { phoneRecognitionAvailable } from '@/lib/speechrec';
import { pick } from '@/lib/pick';
import { speak } from '@/lib/tts';
import { useSettings, type Settings } from '@/store/settings';

const LANGS = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Arabic', 'Portuguese', 'Russian', 'Korean', 'Italian', 'Tamil', 'Bengali', 'Urdu'];

/** Languages offered for dictation with the phone's recognizer (BCP-47 tags). */
const DICTATION_LANGS = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)'], ['hi-IN', 'Hindi'], ['ml-IN', 'Malayalam'], ['ta-IN', 'Tamil'],
  ['te-IN', 'Telugu'], ['kn-IN', 'Kannada'], ['bn-IN', 'Bengali'], ['mr-IN', 'Marathi'], ['gu-IN', 'Gujarati'], ['ur-PK', 'Urdu'], ['ar-SA', 'Arabic'],
  ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'], ['ru-RU', 'Russian'],
  ['tr-TR', 'Turkish'], ['id-ID', 'Indonesian'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['zh-CN', 'Chinese (Mandarin)'],
].map(([value, label]) => ({ value, label }));

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
        <SectionTitle>Dictation (mic button)</SectionTitle>
        <Card>
          <ListRow
            label="Dictate with"
            value={s.dictationEngine === 'phone' ? 'This phone' : 'My endpoint'}
            onPress={() => pick('Dictate with', [{ value: 'phone', label: 'This phone', note: phoneRecognitionAvailable() ? 'Live text while you speak' : 'Not available in this build' }, { value: 'endpoint', label: 'My endpoint', note: 'Records, then transcribes (Whisper)' }], s.dictationEngine, (v) => s.set({ dictationEngine: v as Settings['dictationEngine'] }))}
            last={s.dictationEngine === 'endpoint'}
          />
          {s.dictationEngine === 'phone' && (
            <>
              <ListRow label="Language" value={DICTATION_LANGS.find((l) => l.value === s.dictationLang)?.label ?? 'Phone language'} onPress={() => pick('Dictation language', [{ value: '', label: 'Phone language' }, ...DICTATION_LANGS], s.dictationLang, (dictationLang) => s.set({ dictationLang }))} />
              <ListRow label="Only on this phone" sub="Never sends your voice to Apple or Google. May be less accurate and isn’t available for every language." toggle={{ on: s.dictationOnDevice, onChange: (dictationOnDevice) => s.set({ dictationOnDevice }) }} last />
            </>
          )}
        </Card>
        <Text size={12} color="muted">
          {s.dictationEngine === 'phone'
            ? 'Words appear as you speak. The phone’s own speech service does the listening: Apple on iPhone, Google on Android. Unless “Only on this phone” is on, your voice goes to that company.'
            : 'No live text: your recording is uploaded to the endpoint below when you tap the check mark.'}
        </Text>
        <EndpointRoute cap="transcription" modelPlaceholder="whisper-1" hint="Used when you dictate with My endpoint. Calls POST /v1/audio/transcriptions on the endpoint you pick." />
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
