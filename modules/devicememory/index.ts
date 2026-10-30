import { requireOptionalNativeModule } from 'expo-modules-core';

export type DeviceMemorySnapshot = {
  availableMemory: number;
  totalMemory: number;
  lowMemory?: boolean;
};

type DeviceMemoryModule = {
  /** A point-in-time platform memory snapshot in bytes. Android also reports its low-memory flag. */
  getMemoryInfo(): DeviceMemorySnapshot | null;
};

/** Android and iOS. Null in Expo Go and web; callers should retain their total-memory fallback. */
export const DeviceMemory = requireOptionalNativeModule<DeviceMemoryModule>('DeviceMemory');
