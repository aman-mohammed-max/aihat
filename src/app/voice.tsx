import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { streamChat, transcribe } from '@/api/openai';
import { Header, Icon, Segmented, Text } from '@/components';
import { requireRoute } from '@/lib/endpoints';
import { useDraft } from '@/store/draft';
import { useProviders, isChatModel } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

type Mode = 'translate' | 'transcribe';

export default function Voice() {
  const { colors } = useTheme();
  const s = useSettings();
  const provider = useProviders((p) => p.providers.find((x) => x.id === s.defaultProviderId) ?? p.providers.find((x) => x.isDefault) ?? p.providers[0]);
  const chatModel = s.defaultModelId ?? useProviders.getState().models.find((m) => m.providerId === provider?.id && isChatModel(m))?.id;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [mode, setMode] = useState<Mode>(s.translateTo === 'English' ? 'transcribe' : 'translate');
  const [heard, setHeard] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // iOS plays no haptics while the audio session is in recording mode, so always hand it back when leaving.
    const release = () => {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
    (async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return Alert.alert('Microphone access is needed', 'Allow it in Settings to dictate.', [{ text: 'OK', onPress: () => router.back() }]);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      started.current = true;
    })();
    return release;
  }, [recorder]);

  const finish = async () => {
    if (!started.current) return router.back();
    setBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) throw new Error('Nothing was recorded.');
      const stt = requireRoute('transcription');
      const text = await transcribe(stt.provider, stt.model, uri);
      setHeard(text);
      let final = text;
      if (mode === 'translate' && chatModel) {
        final = '';
        for await (const ev of streamChat(provider, { model: chatModel, messages: [{ role: 'system', content: `Translate the user's text into ${s.translateTo}. Reply with the translation only.` }, { role: 'user', content: text }] })) {
          if (ev.type === 'delta') { final += ev.text; setOut(final); }
        }
      } else setOut(text);
      useDraft.getState().set({ text: (useDraft.getState().text + ' ' + final).trim() });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not transcribe', e.message);
      setBusy(false);
    }
  };

  const secs = Math.floor((state.durationMillis ?? 0) / 1000);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header left="close" title={busy ? 'Working…' : 'Listening'} />
      <View style={{ flex: 1, padding: 20, gap: 24, justifyContent: 'center' }}>
        <View style={{ gap: 6 }}>
          <Text size={12} color="muted">Heard</Text>
          <Text size={18} color={heard ? 'text' : 'faint'}>{heard || (busy ? '…' : 'Speak now')}</Text>
        </View>
        {mode === 'translate' && (
          <View style={{ gap: 6 }}>
            <Text size={12} color="accent">Will send · {s.translateTo}</Text>
            <Text size={18}>{out}</Text>
          </View>
        )}
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Segmented<Mode> options={[{ value: 'translate', label: `Translate → ${s.translateTo}` }, { value: 'transcribe', label: 'Transcribe only' }]} value={mode} onChange={setMode} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: 24, paddingBottom: 48 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => { recorder.stop().catch(() => {}); setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {}); router.back(); }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={22} color={colors.text} />
        </Pressable>
        <Text mono size={16} color="text2">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Done, add to message" disabled={busy} onPress={finish} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
          <Icon name="check" size={24} color={colors.onAccent} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}
