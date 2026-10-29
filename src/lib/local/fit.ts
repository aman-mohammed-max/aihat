import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { device } from '@/lib/device';

import { gb } from './catalog';

export type Fit = 'good' | 'ok' | 'no' | 'unknown';

/** This device's name and memory, e.g. "iPhone 15 Pro", 8 GB. */
export function thisDevice() {
  return { name: Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : `Android ${device}`), memory: Device.totalMemory ?? 0 };
}

/** Memory a model needs while it runs: the file (read into memory) plus room for the conversation. */
export const needs = (size: number) => size * 1.15 + 600e6;

/**
 * Whether a model of this size runs here. An app gets roughly half the memory before the system closes it (iOS is
 * stricter), and a model that fills that leaves no room for anything else, so "good" keeps a margin.
 */
export function fit(size: number, memory = thisDevice().memory): Fit {
  if (!memory || !size) return 'unknown';
  const budget = memory * (Platform.OS === 'ios' ? 0.5 : 0.55);
  const need = needs(size);
  return need <= budget * 0.6 ? 'good' : need <= budget ? 'ok' : 'no';
}

/** The words for a fit, about this device. */
export function fitLabel(f: Fit, size: number) {
  const { name } = thisDevice();
  if (f === 'good') return `Runs well on this ${name}`;
  if (f === 'ok') return `Fits on this ${name}, but may be slow`;
  if (f === 'no') return `Too big for this ${name}: needs about ${gb(needs(size))} of memory`;
  return 'Couldn’t check this device’s memory';
}
