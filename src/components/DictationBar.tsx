import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Platform, Pressable, View } from 'react-native';

import { transcribe } from '@/api/openai';
import { requireRoute } from '@/lib/endpoints';
import { phononTranscribe } from '@/lib/local/phonon';
import * as haptic from '@/lib/haptics';
import { quickComplete } from '@/lib/llm';
import { assemble, dictationLocale, phoneRecognitionOnDevice, speechRec } from '@/lib/speechrec';
import { useDictation } from '@/store/dictation';
import { useDraft } from '@/store/draft';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { PulseDots } from './Motion';
import { Text } from './Text';

const REC_RED = '#FF6B6B';

const allowMic = () =>
  Alert.alert('Microphone access is needed', 'Allow the microphone (and speech recognition on iPhone) for AI Hat in Settings to dictate.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => Linking.openSettings() },
  ]);

/** Put the spoken text in the message box, translated first when asked. */
async function deliver(raw: string, translate: boolean, signal?: AbortSignal) {
  let text = raw.trim();
  if (signal?.aborted) return;
  if (!text) return toast('Didn’t catch anything');
  const lang = useSettings.getState().translateTo;
  if (translate && lang !== 'English') {
    useDictation.getState().patch({ phase: 'working', note: `Translating to ${lang}…` });
    try {
      text = (await quickComplete({ system: `Translate the user's text into ${lang}. Reply with the translation only.`, user: text, maxTokens: 800, temperature: 0.2, signal })) || text;
    } catch {
      if (signal?.aborted) return;
      toast('Couldn’t translate, so the text was added as spoken');
    }
  }
  if (signal?.aborted) return;
  const draft = useDraft.getState();
  draft.set({ text: (draft.text + ' ' + text).trim() });
  haptic.success();
}

function releaseIosAudio() {
  if (Platform.OS !== 'ios') return;
  try {
    speechRec()?.ExpoSpeechRecognitionModule.setAudioSessionActiveIOS(false, { notifyOthersOnDeactivation: true });
  } catch {
    /* nothing to release */
  }
}

const FRIENDLY: Record<string, string> = {
  'not-allowed': 'Microphone or speech recognition access was denied.',
  'service-not-allowed': 'Speech recognition is switched off on this phone. On iPhone turn on Siri & Dictation; on Android install or enable the Google speech service.',
  'language-not-supported': 'This phone can’t recognise that language. Pick another one in Settings › Voice & speech › Dictation.',
  network: 'Speech recognition needs the internet right now.',
  'audio-capture': 'The microphone isn’t available. Another app may be using it.',
  busy: 'Speech recognition is busy. Try again in a moment.',
  interrupted: 'The recording was interrupted.',
};

/** Live dictation with the phone's own recognizer: words appear while you speak. */
function PhoneEngine() {
  const signal = useDictation((s) => s.signal);
  const ctl = useRef<{ stop: () => void; abort: () => void } | null>(null);

  useEffect(() => {
    const rec = speechRec();
    const st = useDictation.getState;
    if (!rec) {
      toast('Speech recognition isn’t available in this build');
      st().reset();
      return;
    }
    const M = rec.ExpoSpeechRecognitionModule;
    const finals: string[] = [];
    let interim = '';
    let lastError: string | null = null;
    // Events from an earlier, aborted session can still arrive; only count the ones after this session's own "start".
    let started = false;
    let mode: 'running' | 'stopping' | 'cancelled' | 'done' = 'running';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deliveryController = new AbortController();
    const options = () => {
      const s = useSettings.getState();
      return {
        lang: dictationLocale(s.dictationLang),
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: s.dictationOnDevice,
        iosTaskHint: 'dictation' as const,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      };
    };

    const finish = async () => {
      if (mode === 'done') return;
      const signalNumber = st().signal.n;
      const cancelled = mode === 'cancelled';
      mode = 'done';
      clearTimeout(timer);
      subs.forEach((s) => s.remove());
      releaseIosAudio();
      if (cancelled) return st().reset();
      const text = assemble(finals, interim);
      try {
        if (!text && lastError && !['no-speech', 'speech-timeout', 'aborted'].includes(lastError)) Alert.alert('Dictation didn’t work', FRIENDLY[lastError] ?? 'Something went wrong with speech recognition. Try again.');
        else {
          st().patch({ phase: 'working', note: 'Adding text…' });
          await deliver(text, st().translate, deliveryController.signal);
        }
      } finally {
        if (st().signal.n === signalNumber) st().reset();
      }
    };

    const subs = [
      M.addListener('start', () => {
        started = true;
        haptic.soft();
        st().patch({ phase: 'listening', startedAt: Date.now() });
      }),
      M.addListener('result', (e) => {
        if (!started) return;
        const t = e.results[0]?.transcript ?? '';
        if (e.isFinal) {
          if (t) finals.push(t);
          interim = '';
        } else interim = t;
        st().patch({ text: assemble(finals, interim) });
      }),
      M.addListener('volumechange', (e) => st().patch({ level: Math.max(0, Math.min(1, e.value / 8)) })),
      M.addListener('error', (e) => {
        if (e.error === 'aborted') return;
        lastError = e.error;
        if (!started) void finish(); // it never began (no permission, service off, language missing): report it now
      }),
      // Some iOS versions end a recognition session after a pause even in continuous mode. Keep dictation open
      // and start a fresh native segment; only a user tap on Done should finish the dictation UI.
      M.addListener('end', () => {
        if (!started || mode === 'done' || mode === 'cancelled') return;
        if (mode === 'stopping') return void finish();
        if (lastError && !['no-speech', 'speech-timeout'].includes(lastError)) return void finish();
        lastError = null;
        st().patch({ phase: 'listening', level: 0, text: assemble(finals, interim) });
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (mode !== 'running') return;
          try {
            M.start(options());
          } catch {
            lastError = 'unknown';
            void finish();
          }
        }, 250);
      }),
    ];

    ctl.current = {
      stop: () => {
        if (mode !== 'running') return;
        mode = 'stopping';
        st().patch({ level: 0 });
        try {
          M.stop();
        } catch {
          void finish();
          return;
        }
        timer = setTimeout(() => void finish(), 3000); // never leave the bar hanging if "end" doesn't arrive
      },
      abort: () => {
        deliveryController.abort();
        if (mode === 'done') {
          st().reset();
          return;
        }
        if (mode === 'cancelled') return;
        mode = 'cancelled';
        try {
          M.abort();
        } catch {
          /* already stopped */
        }
        void finish();
      },
    };

    (async () => {
      try {
        const perm = await M.requestPermissionsAsync();
        if (mode !== 'running') return;
        if (!perm.granted) {
          allowMic();
          mode = 'cancelled';
          return void finish();
        }
        const s = useSettings.getState();
        if (s.dictationOnDevice && !phoneRecognitionOnDevice()) {
          Alert.alert('Not available on this phone', 'Dictation “only on this phone” isn’t supported for this phone or language. Turn that off in Settings › Voice & speech to use Apple or Google’s speech service.');
          mode = 'cancelled';
          return void finish();
        }
        M.start(options());
      } catch (e: any) {
        lastError = 'unknown';
        Alert.alert('Dictation didn’t work', e?.message ?? 'Try again.');
        mode = 'cancelled';
        void finish();
      }
    })();

    return () => {
      ctl.current = null;
      deliveryController.abort();
      if (mode === 'done') return;
      // Closing the bar, or React re-running this effect in development: stop listening and forget this session.
      mode = 'cancelled';
      clearTimeout(timer);
      subs.forEach((s) => s.remove());
      try {
        M.abort();
      } catch {
        /* already stopped */
      }
      releaseIosAudio();
    };
  }, []);

  useEffect(() => {
    if (signal.kind === 'finish') ctl.current?.stop();
    else if (signal.kind === 'cancel') ctl.current?.abort();
  }, [signal.n, signal.kind]);

  return null;
}

const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
/** Phonon-2 on the device reads 16 kHz mono, so it records that way (no resampling, and a smaller file). */
const RECORDING_16K = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true };

/** Records, then sends the audio to the transcription endpoint. No live text, because the words only exist after the upload. */
function EndpointEngine() {
  const signal = useDictation((s) => s.signal);
  // The same recorder for Phonon-2 on the device: it records, then the words come from the device instead of an upload.
  const [local] = useState(() => useDictation.getState().engine === 'phonon');
  const recorder = useAudioRecorder(local ? RECORDING_16K : RECORDING);
  const rec = useAudioRecorderState(recorder, 120);
  const started = useRef(false);
  const dropped = useRef(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const st = useDictation.getState;
    dropped.current = false;
    started.current = false;
    (async () => {
      try {
        if (!local) requireRoute('transcription'); // throws a helpful message when no endpoint is added
        const perm = await requestRecordingPermissionsAsync();
        if (!alive || dropped.current || st().phase === 'idle') return;
        if (!perm.granted) {
          allowMic();
          return st().reset();
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!alive || dropped.current || st().phase === 'idle') {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
          return;
        }
        await recorder.prepareToRecordAsync();
        if (!alive || dropped.current || st().phase === 'idle') {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
          return;
        }
        recorder.record();
        started.current = true;
        haptic.soft();
        st().patch({ phase: 'listening', startedAt: Date.now() });
      } catch (e: any) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        if (!dropped.current && alive) {
          Alert.alert('Dictation didn’t work', e?.message ?? 'Try again.');
          st().reset();
        }
      }
    })();
    return () => {
      alive = false;
      dropped.current = true;
      request.current?.abort();
      request.current = null;
      if (started.current) recorder.stop().catch(() => {});
      // iOS plays no haptics while the audio session is in recording mode, so hand it back.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
  }, [recorder, local]);

  useEffect(() => {
    if (rec.metering !== undefined) useDictation.getState().patch({ level: Math.max(0, Math.min(1, (rec.metering + 55) / 55)) });
  }, [rec.metering]);

  useEffect(() => {
    const st = useDictation.getState;
    if (signal.kind === 'cancel') {
      dropped.current = true;
      request.current?.abort();
      st().reset();
    } else if (signal.kind === 'finish' && started.current) {
      (async () => {
        const signalNumber = st().signal.n;
        const controller = new AbortController();
        request.current = controller;
        st().patch({ phase: 'working', note: 'Transcribing…', level: 0 });
        try {
          await recorder.stop();
          started.current = false;
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
          const uri = recorder.uri;
          if (!uri) throw new Error('Nothing was recorded.');
          let text: string;
          if (local) {
            st().patch({ note: 'Transcribing on this device…' });
            text = await phononTranscribe(uri);
          } else {
            const stt = requireRoute('transcription');
            text = await transcribe(stt.provider, stt.model, uri, false, controller.signal);
          }
          if (!dropped.current) await deliver(text, st().translate, controller.signal);
        } catch (e: any) {
          if (!dropped.current && !controller.signal.aborted) Alert.alert('Could not transcribe', e?.message ?? 'Try again.');
        } finally {
          if (request.current === controller) request.current = null;
          if (!dropped.current && st().signal.n === signalNumber) st().reset();
        }
      })();
    }
  }, [signal.n, signal.kind, recorder, local]);

  return null;
}

function Bars({ level }: { level: number }) {
  const { colors } = useTheme();
  return (
    <View accessibilityElementsHidden style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 }}>
      {[0.55, 0.85, 1, 0.8, 0.5].map((k, i) => (
        <View key={i} style={{ width: 3, height: 4 + level * 16 * k, borderRadius: 2, backgroundColor: level > 0.04 ? colors.accent : colors.faint }} />
      ))}
    </View>
  );
}

function RecDot() {
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.25, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: REC_RED, opacity: o }} />;
}

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/** The last few words are what matter while speaking, so a long text is shown from its tail. */
const tail = (t: string, max = 170) => (t.length <= max ? t : '…' + t.slice(t.length - max).replace(/^\S*\s/, ''));

/**
 * Small bar above the message box while dictating: a red dot so you know it is recording, a timer, a level meter,
 * the words as they are heard (phone engine), and cancel / done. Nothing else on screen changes.
 */
export function DictationBar() {
  const { colors } = useTheme();
  const d = useDictation();
  const translateTo = useSettings((s) => s.translateTo);
  const [secs, setSecs] = useState(0);

  // Leaving the chat screen ends any dictation in progress.
  useEffect(() => () => useDictation.getState().reset(), []);

  useEffect(() => {
    if (d.phase !== 'listening') return;
    const tick = () => setSecs(Math.max(0, Math.round((Date.now() - d.startedAt) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [d.phase, d.startedAt]);

  if (d.phase === 'idle') return null;
  const working = d.phase === 'working';
  const label = working ? d.note : d.phase === 'verifying' ? 'Checking Phonon-2…' : d.phase === 'starting' ? 'Starting…' : d.text ? '' : d.engine === 'phone' ? 'Listening…' : 'Recording…';

  const btn = (name: 'close' | 'check', text: string, onPress: () => void, primary?: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? colors.accent : 'transparent' }}>
      <Icon name={name} size={name === 'check' ? 20 : 18} color={primary ? colors.onAccent : colors.text2} strokeWidth={name === 'check' ? 2.2 : 1.8} />
    </Pressable>
  );

  return (
    <View
      accessibilityLabel={d.phase === 'verifying' ? 'Checking Phonon-2' : working ? d.note : `Recording, ${clock(secs)}`}
      style={{ marginHorizontal: 12, marginBottom: 6, borderRadius: 24, backgroundColor: colors.surface2, paddingLeft: 16, paddingRight: 4 }}>
      {d.phase !== 'verifying' && (d.engine === 'phone' ? <PhoneEngine /> : <EndpointEngine />)}
      <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {working ? <PulseDots /> : <RecDot />}
        {!working && <Text mono size={13} color="text2" style={{ minWidth: 34 }}>{clock(secs)}</Text>}
        {!working && <Bars level={d.level} />}
        <Text size={13.5} color="muted" style={{ flex: 1 }} numberOfLines={1}>{label}</Text>
        {!working && translateTo !== 'English' && (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: d.translate }}
            accessibilityLabel={`Translate into ${translateTo}`}
            onPress={() => {
              haptic.select();
              useDictation.getState().patch({ translate: !d.translate });
            }}
            style={{ height: 30, borderRadius: 15, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: d.translate ? colors.accentSoft : 'transparent', borderWidth: 1, borderColor: d.translate ? 'transparent' : colors.border }}>
            <Text size={12} color={d.translate ? 'accent' : 'muted'} numberOfLines={1}>{d.translate ? `→ ${translateTo}` : 'As spoken'}</Text>
          </Pressable>
        )}
        {btn('close', 'Cancel dictation', () => useDictation.getState().cancel())}
        {!working && d.phase === 'listening' && btn('check', 'Done, add to message', () => useDictation.getState().finish(), true)}
      </View>
      {!working && !!d.text && (
        <Text size={15} color="text" style={{ paddingRight: 14, paddingBottom: 12, lineHeight: 21 }} accessibilityLiveRegion="none">{tail(d.text)}</Text>
      )}
    </View>
  );
}
