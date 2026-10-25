import { Platform } from 'react-native';

/**
 * The phone's own speech recognizer (expo-speech-recognition). It is a native module that Expo Go doesn't include, so it is
 * loaded on first use and a missing module just means "not available": dictation then uses the transcription endpoint.
 */
type Mod = typeof import('expo-speech-recognition');
let cached: Mod | null | undefined;

export function speechRec(): Mod | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-speech-recognition') as Mod;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when the phone can turn speech into text by itself (Siri / Google, or fully on the phone). */
export function phoneRecognitionAvailable() {
  try {
    return !!speechRec()?.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export function phoneRecognitionOnDevice() {
  try {
    return !!speechRec()?.ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

/** The language tag to listen for: the one chosen in settings, else the phone's own. */
export function dictationLocale(chosen: string) {
  if (chosen) return chosen;
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return Platform.OS === 'ios' ? 'en-US' : 'en';
  }
}

/**
 * Join recognizer results into one text. iOS sends the whole text so far each time (one final result at the end);
 * Android's continuous mode sends separate segments, each closing with a final result. Both work with this.
 */
export function assemble(finals: string[], interim: string) {
  return [...finals, interim].map((t) => t.trim()).filter(Boolean).join(' ');
}
