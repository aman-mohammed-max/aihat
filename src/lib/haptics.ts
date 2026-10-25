import * as Haptics from 'expo-haptics';

import { useSettings } from '@/store/settings';

/**
 * One small haptic vocabulary for the whole app, on the Taptic Engine (iPhone) and the vibration motor (Android).
 * Android uses the same impact / notification calls rather than the system "touch feedback" constants, because
 * those do nothing on phones where touch feedback is switched off in system settings.
 * Calls closer than 40 ms apart are dropped, so nothing ever buzzes continuously.
 */
type Kind = 'select' | 'tap' | 'toggleOn' | 'toggleOff' | 'success' | 'warning' | 'error' | 'longPress' | 'soft';

const PLAY: Record<Kind, () => Promise<void>> = {
  select: () => Haptics.selectionAsync(),
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  soft: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  toggleOn: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  toggleOff: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  longPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

let last = 0;
function fire(kind: Kind) {
  if (!useSettings.getState().haptics) return;
  const t = Date.now();
  if (t - last < 40) return;
  last = t;
  PLAY[kind]().catch((e) => {
    if (__DEV__) console.warn(`[haptics] ${kind} failed:`, e?.message ?? e);
  });
}

/** Switches, segmented controls, chips, picking a value. */
export const select = () => fire('select');
/** Pressing a button: send, add, mic. */
export const tap = () => fire('tap');
/** A very light tick, for example when a reply starts streaming or a sheet opens. */
export const soft = () => fire('soft');
export const toggle = (on: boolean) => fire(on ? 'toggleOn' : 'toggleOff');
/** Long-press (message actions). */
export const longPress = () => fire('longPress');
/** Something finished well: copied, connected, reply done. */
export const success = () => fire('success');
/** Something needs care: stopping a reply, a destructive choice. */
export const warning = () => fire('warning');
/** Something failed. */
export const error = () => fire('error');

/**
 * Play the whole vocabulary once, ignoring the Haptics switch, so you can feel what your phone does.
 * Resolves with a short explanation when the device refused, or null when everything played.
 */
export async function test(): Promise<string | null> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    for (const k of ['select', 'tap', 'toggleOn', 'longPress', 'success', 'warning', 'error'] as Kind[]) {
      await PLAY[k]();
      await wait(260);
    }
    return null;
  } catch (e: any) {
    return e?.message ?? 'The phone refused the vibration.';
  }
}
