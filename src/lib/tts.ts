import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import { synthesize } from '@/api/openai';
import { useSpeech } from '@/store/speech';
import { useSettings } from '@/store/settings';

import { requireRoute } from './endpoints';
import { cleanForSpeech as clean, splitForSpeech as split } from './speech-text';
import { saveBytes } from './media';

let player: AudioPlayer | null = null;
let ticket = 0; // bumps on every speak/stop, so nothing from an earlier reading keeps going after Stop

// The phone's own voice reads one short piece at a time. Stop then ends it at once, Pause works on Android too
// (it stops and later starts again from the same piece), and long replies stay under the voice's length limit.
let pieces: string[] = [];
let at = 0;

const set = (p: Parameters<ReturnType<typeof useSpeech.getState>['set']>[0]) => useSpeech.getState().set(p);

function stopPlayer() {
  const p = player;
  player = null;
  if (!p) return;
  try {
    p.pause();
  } catch {
    /* already gone */
  }
  try {
    p.remove();
  } catch {
    /* already gone */
  }
}

export function stopSpeaking() {
  ticket++;
  pieces = [];
  at = 0;
  Speech.stop();
  stopPlayer();
  set({ status: 'idle' });
}

/** Read pieces[at…] with the phone's voice, one after another. */
function speakFrom(mine: number) {
  if (mine !== ticket || at >= pieces.length) {
    if (mine === ticket) set({ status: 'idle' });
    return;
  }
  const next = () => {
    if (mine !== ticket || useSpeech.getState().status !== 'playing') return;
    at++;
    speakFrom(mine);
  };
  Speech.speak(pieces[at], {
    onDone: next,
    onError: () => {
      if (mine === ticket) set({ status: 'idle' });
    },
  });
}

export function pauseSpeaking() {
  if (useSpeech.getState().status !== 'playing') return;
  set({ status: 'paused' });
  if (player) player.pause();
  else {
    // Stop the current piece; Resume reads it again from its start.
    ticket++;
    Speech.stop();
  }
}

export function resumeSpeaking() {
  if (useSpeech.getState().status !== 'paused') return;
  set({ status: 'playing' });
  if (player) player.play();
  else speakFrom(++ticket);
}

/** Read text aloud with the phone's voice, or through the speech endpoint chosen in Voice & speech. */
export async function speak(text: string) {
  stopSpeaking();
  const input = clean(text);
  if (!input) return;
  const mine = ++ticket;
  const s = useSettings.getState();

  if (s.ttsEngine === 'device') {
    pieces = split(input);
    at = 0;
    set({ status: 'playing', canPause: true });
    speakFrom(mine);
    return;
  }

  set({ status: 'loading', canPause: true });
  try {
    const { provider, model } = requireRoute('speech');
    const { bytes, ext } = await synthesize(provider, { model, input: input.slice(0, 4000), voice: s.ttsVoice });
    if (mine !== ticket) return; // stopped while downloading
    await setAudioModeAsync({ playsInSilentMode: true });
    if (mine !== ticket) return;
    const p = createAudioPlayer({ uri: saveBytes(bytes, ext) });
    player = p;
    p.addListener('playbackStatusUpdate', (st) => {
      if (st.didJustFinish && player === p) {
        stopPlayer();
        if (mine === ticket) set({ status: 'idle' });
      }
    });
    p.play();
    set({ status: 'playing' });
  } catch (e) {
    if (mine === ticket) set({ status: 'idle' });
    throw e;
  }
}
