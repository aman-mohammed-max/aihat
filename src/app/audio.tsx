import { Alert, View } from 'react-native';

import { listVoices } from '@/api/openai';
import { EndpointRoute, Group, ListRow, Note, Screen, SectionTitle } from '@/components';
import { resolveRoute } from '@/lib/endpoints';
import { phoneRecognitionAvailable } from '@/lib/speechrec';
import { pick } from '@/lib/pick';
import { speak } from '@/lib/tts';
import { useSettings, type Settings } from '@/store/settings';
import { device } from '@/lib/device';

/** “This phone”, “This tablet” or “This computer”. */
const thisDevice = `This ${device}`;

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
    <Screen header={{ title: 'Voice & speech' }} gap={16}>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Dictation (mic button)</SectionTitle>
        <Group>
          <ListRow
            label="Dictate with"
            height={50}
            value={s.dictationEngine === 'phone' ? thisDevice : 'My endpoint'}
            onPress={() => pick('Dictate with', [{ value: 'phone', label: thisDevice, note: phoneRecognitionAvailable() ? 'Live text while you speak' : 'Not available in this build' }, { value: 'endpoint', label: 'My endpoint', note: 'Records, then transcribes (Whisper)' }], s.dictationEngine, (v) => s.set({ dictationEngine: v as Settings['dictationEngine'] }))}
          />
          {s.dictationEngine === 'phone' && (
            <ListRow label="Language" height={50} value={DICTATION_LANGS.find((l) => l.value === s.dictationLang)?.label ?? `${device === 'computer' ? 'System' : 'Phone'} language`} onPress={() => pick('Dictation language', [{ value: '', label: `${device === 'computer' ? 'System' : 'Phone'} language` }, ...DICTATION_LANGS], s.dictationLang, (dictationLang) => s.set({ dictationLang }))} />
          )}
          {s.dictationEngine === 'phone' && (
            <ListRow label={`Only on this ${device}`} sub="Never sends your voice to Apple or Google. May be less accurate and isn’t available for every language." height={52} toggle={{ on: s.dictationOnDevice, onChange: (dictationOnDevice) => s.set({ dictationOnDevice }) }} />
          )}
        </Group>
        <Note>
          {s.dictationEngine === 'phone'
            ? `Words appear as you speak. The ${device}’s own speech service does the listening (Apple on iPhone, Google on Android). Unless “Only on this ${device}” is on, your voice goes to that company. Choose “My endpoint” to record and upload to your own server instead; that has no live text.`
            : 'No live text: your recording is uploaded to the endpoint below when you tap the check mark.'}
        </Note>
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Speech to text (when dictating with My endpoint)</SectionTitle>
        <EndpointRoute cap="transcription" modelPlaceholder="whisper-1" />
      </View>
      <View>
        <SectionTitle>Translation</SectionTitle>
        <ListRow label="Translate into" height={50} value={s.translateTo} onPress={() => pick('Translate into', LANGS, s.translateTo, (v) => s.set({ translateTo: v }))} />
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Text to speech</SectionTitle>
        <Group>
          <ListRow label="Voice engine" height={50} value={s.ttsEngine === 'device' ? thisDevice : 'My endpoint'} onPress={() => pick('Voice engine', [{ value: 'device', label: thisDevice, note: 'Works offline' }, { value: 'endpoint', label: 'My endpoint', note: 'POST /v1/audio/speech' }], s.ttsEngine, (v) => s.set({ ttsEngine: v as Settings['ttsEngine'] }))} />
          {s.ttsEngine === 'endpoint' && <ListRow label="Voice" height={50} value={s.ttsVoice || 'Server default'} onPress={chooseVoice} />}
          <ListRow label="Play a sample" height={50} chevron={false} onPress={() => speak('This is how replies will sound.').catch((e) => Alert.alert('Could not play the sample', e.message))} />
        </Group>
        {s.ttsEngine === 'endpoint' && <EndpointRoute cap="speech" modelPlaceholder="tts-1" hint="The voice list comes from the endpoint (GET /audio/voices) when it has one; otherwise OpenAI’s standard voices are shown." />}
        <ListRow label="Read replies aloud" height={46} toggle={{ on: s.autoReadAloud, onChange: (autoReadAloud) => s.set({ autoReadAloud }) }} />
        <Note>{`While a reply is read, a bar above the chat box has Pause and Stop. The ${device}’s own voice can pause on iPhone; on Android it can only stop.`}</Note>
      </View>
    </Screen>
  );
}
