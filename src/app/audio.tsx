import { useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';

import { listVoices } from '@/api/openai';
import { Button, EndpointRoute, Group, Icon, ListRow, Note, Screen, SectionTitle, Text } from '@/components';
import { gb } from '@/lib/local/catalog';
import { PHONON_DOWNLOAD, phononSupported, usePhonon } from '@/lib/local/phonon';
import { useTheme } from '@/theme';
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

/**
 * Phonon-2, speech to text on the device: shown first and set apart, with its download. Once it is on the device it can
 * be the dictation engine.
 */
function PhononCard() {
  const { colors } = useTheme();
  const s = useSettings();
  const ph = usePhonon();
  const refresh = usePhonon((x) => x.refresh);
  useEffect(() => refresh(), [refresh]);
  const supported = phononSupported();
  const using = s.dictationEngine === 'phonon' && ph.phase === 'ready';
  const pct = Math.min(100, Math.round((ph.written / PHONON_DOWNLOAD) * 100));

  const start = () =>
    ph.download().then(
      () => {
        if (usePhonon.getState().phase === 'ready') s.set({ dictationEngine: 'phonon' });
      },
      (e: Error) => Alert.alert('Couldn’t download Phonon-2', e.message),
    );
  const remove = () =>
    Alert.alert('Delete Phonon-2?', `It frees ${gb(PHONON_DOWNLOAD)}. Dictation goes back to this ${device}’s own speech service.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          ph.remove();
          if (s.dictationEngine === 'phonon') s.set({ dictationEngine: 'phone' });
        },
      },
    ]);

  return (
    <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.surface, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="mic" size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text size={15} weight="semi">Phonon-2</Text>
          <Text size={12} color="muted">{`Speech to text on this ${device} · English · ${gb(PHONON_DOWNLOAD)}`}</Text>
        </View>
        {using ? <Text size={12} weight="medium" color="accent">In use</Text> : null}
      </View>
      <Text size={13} color="text2" style={{ lineHeight: 19 }}>{`Very accurate dictation that runs on the ${device} itself: it works offline, and your voice never leaves it.`}</Text>
      {!supported ? (
        <Text size={12.5} color="muted">
          {Platform.OS === 'web' ? 'Not in the desktop app yet.' : 'This needs the AI Hat app from the Releases page on a 64-bit Android phone or tablet, or an iPhone or iPad with iOS 18 or later.'}
        </Text>
      ) : ph.phase === 'downloading' || ph.phase === 'paused' ? (
        <View style={{ gap: 8 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: 4, backgroundColor: colors.accent }} />
          </View>
          <Text size={11.5} color="muted">{`${gb(ph.written)} of ${gb(PHONON_DOWNLOAD)} · ${pct}%${ph.phase === 'paused' ? ' · paused' : ''}`}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {ph.phase === 'downloading' ? <Button label="Pause" variant="outline" height={36} textSize={13} onPress={ph.pause} /> : <Button label="Resume" height={36} textSize={13} onPress={start} />}
            <Button label="Cancel" variant="outline" height={36} textSize={13} onPress={ph.cancel} />
          </View>
        </View>
      ) : ph.phase === 'preparing' ? (
        <Text size={12.5} color="muted">Unpacking the model… this takes about a minute.</Text>
      ) : ph.phase === 'ready' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {using ? null : <Button label="Use for dictation" height={38} textSize={13.5} onPress={() => s.set({ dictationEngine: 'phonon' })} />}
          <Button label="Delete" variant="danger" height={38} textSize={13.5} onPress={remove} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {ph.phase === 'failed' ? <Text size={12.5} color="danger">{ph.error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={ph.phase === 'failed' ? 'Try again' : `Download · ${gb(PHONON_DOWNLOAD)}`} height={38} textSize={13.5} onPress={start} />
            {ph.phase === 'failed' ? <Button label="Delete" variant="outline" height={38} textSize={13.5} onPress={remove} /> : null}
          </View>
        </View>
      )}
      <Text size={11} color="faint">Phonon-2 by Fermion Research, from NVIDIA Parakeet TDT 0.6B v3 · CC BY 4.0</Text>
    </View>
  );
}

export default function Audio() {
  const s = useSettings();
  const chooseVoice = async () => {
    const { provider } = resolveRoute('speech');
    const fetched = provider ? await listVoices(provider) : null;
    pick('Voice', [{ value: '', label: 'Server default' }, ...(fetched ?? OPENAI_VOICES).map((v) => ({ value: v, label: v, note: fetched ? undefined : 'OpenAI voice' }))], s.ttsVoice, (ttsVoice) => s.set({ ttsVoice }));
  };
  return (
    <Screen header={{ title: 'Voice & speech' }} gap={16}>
      {Platform.OS === 'web' ? null : <PhononCard />}
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Dictation (mic button)</SectionTitle>
        <Group>
          <ListRow
            label="Dictate with"
            height={50}
            value={s.dictationEngine === 'phonon' ? 'Phonon-2' : s.dictationEngine === 'phone' ? thisDevice : 'My endpoint'}
            onPress={() =>
              pick(
                'Dictate with',
                [
                  ...(Platform.OS === 'web' ? [] : [{ value: 'phonon', label: 'Phonon-2', note: usePhonon.getState().phase === 'ready' ? `On this ${device}, offline · English` : 'Download it above first' }]),
                  { value: 'phone', label: thisDevice, note: phoneRecognitionAvailable() ? 'Live text while you speak' : 'Not available in this build' },
                  { value: 'endpoint', label: 'My endpoint', note: 'Records, then transcribes (Whisper)' },
                ],
                s.dictationEngine,
                (v) => {
                  if (v === 'phonon' && usePhonon.getState().phase !== 'ready') return Alert.alert('Download Phonon-2 first', 'Use the Download button in the Phonon-2 card at the top of this page.');
                  s.set({ dictationEngine: v as Settings['dictationEngine'] });
                },
              )
            }
          />
          {s.dictationEngine === 'phone' && (
            <ListRow label="Language" height={50} value={DICTATION_LANGS.find((l) => l.value === s.dictationLang)?.label ?? `${device === 'computer' ? 'System' : 'Phone'} language`} onPress={() => pick('Dictation language', [{ value: '', label: `${device === 'computer' ? 'System' : 'Phone'} language` }, ...DICTATION_LANGS], s.dictationLang, (dictationLang) => s.set({ dictationLang }))} />
          )}
          {s.dictationEngine === 'phone' && (
            <ListRow label={`Only on this ${device}`} sub="Never sends your voice to Apple or Google. May be less accurate and isn’t available for every language." height={52} toggle={{ on: s.dictationOnDevice, onChange: (dictationOnDevice) => s.set({ dictationOnDevice }) }} />
          )}
        </Group>
        <Note>
          {s.dictationEngine === 'phonon'
            ? `Phonon-2 listens on this ${device}: nothing is sent anywhere. The words appear when you tap the check mark.`
            : s.dictationEngine === 'phone'
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
