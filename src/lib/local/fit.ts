import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { device } from '@/lib/device';

import { gb } from './catalog';
import { fitModel, modelCapacity, needs, safeContextSize as calculateSafeContextSize } from './fit-core.mjs';

export { needs };

export type Fit = 'good' | 'ok' | 'no' | 'unknown';

/** This device's name and memory, e.g. "iPhone 15 Pro", 8 GB. */
export function thisDevice() {
  return { name: Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : `Android ${device}`), memory: Device.totalMemory ?? 0 };
}

/** Conservative llama context-size tiers; no portable free-memory API exists. */
export function safeContextSize(memory = thisDevice().memory, modelSize = 0) {
  return calculateSafeContextSize(memory, modelSize);
}

/**
 * Whether a model of this size runs here. An app gets roughly half the memory before the system closes it (iOS is
 * stricter), and a model that fills that leaves no room for anything else, so "good" keeps a margin.
 */
export function fit(size: number, memory = thisDevice().memory): Fit {
  return fitModel(size, memory, Platform.OS);
}

/** The words for a fit, about this device. */
export function fitLabel(f: Fit, size: number) {
  const { name } = thisDevice();
  if (f === 'good') return `Runs well on this ${name}`;
  if (f === 'ok') return `Fits on this ${name}, but may be slow`;
  if (f === 'no') return `Too big for this ${name}: needs about ${gb(needs(size))} of memory`;
  return 'Couldn’t check this device’s memory';
}

/**
 * The biggest model, in billions of parameters at the usual 4-bit size (about 0.62 GB per billion), that runs well
 * here, and the biggest that fits at all ("up to about 4B, or 8B slowly").
 */
export function capacity(memory = thisDevice().memory) {
  return modelCapacity(memory, Platform.OS);
}
