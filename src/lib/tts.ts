import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { synthesize } from '@/api/openai';
import { useSpeech } from '@/store/speech';
import { useSettings } from '@/store/settings';

import { requireRoute } from './endpoints';
import { saveBytes } from './media';

let player: AudioPlayer | null = null;
let ticket = 0; // bumps on every speak/stop so a slow download can't start playing after Cancel

const set = (p: Parameters<ReturnType<typeof useSpeech.getState>['set']>[0]) => useSpeech.getState().set(p);

/** Reading markdown aloud sounds bad: drop code blocks and markup characters. */
const clean = (t: string) => t.replace(/```[\s\S]*?```/g, ' code block. ').replace(/[`*_#>]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').trim();

export function stopSpeaking() {
  ticket++;
  Speech.stop();
  player?.remove();
  player = null;
  set({ status: 'idle' });
}

export function pauseSpeaking() {
  if (useSpeech.getState().status !== 'playing') return;
  if (player) player.pause();
  else if (Platform.OS === 'ios') Speech.pause();
  else return;
  set({ status: 'paused' });
}

export function resumeSpeaking() {
  if (useSpeech.getState().status !== 'paused') return;
  if (player) player.play();
  else Speech.resume();
  set({ status: 'playing' });
}

/** Read text aloud with the phone's voice, or through the speech endpoint chosen in Voice & speech. */
export async function speak(text: string) {
  stopSpeaking();
  const input = clean(text);
  if (!input) return;
  const mine = ++ticket;
  const s = useSettings.getState();

  if (s.ttsEngine === 'device') {
    set({ status: 'playing', canPause: Platform.OS === 'ios' });
    const idle = () => {
      if (mine === ticket) set({ status: 'idle' });
    };
    Speech.speak(input, { onDone: idle, onStopped: idle, onError: idle });
    return;
  }

  set({ status: 'loading', canPause: true });
  try {
    const { provider, model } = requireRoute('speech');
    const { bytes, ext } = await synthesize(provider, { model, input: input.slice(0, 4000), voice: s.ttsVoice });
    if (mine !== ticket) return; // cancelled while downloading
    await setAudioModeAsync({ playsInSilentMode: true });
    const p = createAudioPlayer({ uri: saveBytes(bytes, ext) });
    player = p;
    p.addListener('playbackStatusUpdate', (st) => {
      if (st.didJustFinish && mine === ticket) {
        p.remove();
        player = null;
        set({ status: 'idle' });
      }
    });
    p.play();
    set({ status: 'playing' });
  } catch (e) {
    if (mine === ticket) set({ status: 'idle' });
    throw e;
  }
}
