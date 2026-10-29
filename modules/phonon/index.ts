import { requireOptionalNativeModule } from 'expo-modules-core';

export type PhononNativeModule = {
  /** This device can run the engine (Android: 64-bit ARM, Android 8 and later; iPhone and iPad: iOS 18 and later). */
  isSupported(): boolean;
  /** Android: unpack the downloaded archive into `dir` and check it. iOS: nothing to do. */
  prepare(archive: string, dir: string): Promise<void>;
  /** Build the model from `dir` (once; later calls return at once). */
  load(dir: string): Promise<void>;
  /** An audio file (16 kHz mono is best) → the words in it. */
  transcribeFile(uri: string): Promise<string>;
  /** Free the model's memory. */
  unload(): void;
};

/** Phonon-2 speech recognition on the device. Null in Expo Go and the desktop app, which don't include it. */
export const PhononNative = requireOptionalNativeModule<PhononNativeModule>('Phonon');
