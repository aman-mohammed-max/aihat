import { requireOptionalNativeModule } from 'expo-modules-core';

type CrashLogModule = {
  /** Why the app closed last time, when it wasn't the user closing it (null when nothing happened). Read once. */
  take(): string | null;
};

/** Android only: a record of the last crash, kept so the app can say what happened when it opens again. */
export const CrashLog = requireOptionalNativeModule<CrashLogModule>('CrashLog');
