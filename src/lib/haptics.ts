import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useSettings } from '@/store/settings';

/**
 * One small haptic vocabulary for the whole app. iPhone uses the Taptic Engine styles; Android uses the
 * system's own haptic constants (which feel native and short) instead of a raw vibration.
 * Calls closer than 70 ms apart are dropped, so nothing ever buzzes continuously.
 */
type Kind = 'select' | 'tap' | 'toggleOn' | 'toggleOff' | 'success' | 'warning' | 'error' | 'longPress' | 'soft';

const IOS: Record<Kind, () => Promise<void>> = {
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

const A = Haptics.AndroidHaptics;
const ANDROID: Record<Kind, () => Promise<void>> = {
  select: () => Haptics.performAndroidHapticsAsync(A.Segment_Tick),
  tap: () => Haptics.performAndroidHapticsAsync(A.Virtual_Key),
  soft: () => Haptics.performAndroidHapticsAsync(A.Clock_Tick),
  toggleOn: () => Haptics.performAndroidHapticsAsync(A.Toggle_On),
  toggleOff: () => Haptics.performAndroidHapticsAsync(A.Toggle_Off),
  longPress: () => Haptics.performAndroidHapticsAsync(A.Long_Press),
  success: () => Haptics.performAndroidHapticsAsync(A.Confirm),
  warning: () => Haptics.performAndroidHapticsAsync(A.Context_Click),
  error: () => Haptics.performAndroidHapticsAsync(A.Reject),
};

let last = 0;
function fire(kind: Kind) {
  if (!useSettings.getState().haptics) return;
  const t = Date.now();
  if (t - last < 70) return;
  last = t;
  (Platform.OS === 'android' ? ANDROID : IOS)[kind]().catch(() => {});
}

/** Switches, segmented controls, chips, picking a value. */
export const select = () => fire('select');
/** Pressing a button: send, add, mic. */
export const tap = () => fire('tap');
/** A very light tick, for example when a reply starts streaming. */
export const soft = () => fire('soft');
export const toggle = (on: boolean) => fire(on ? 'toggleOn' : 'toggleOff');
/** Long-press (message actions). */
export const longPress = () => fire('longPress');
/** Something finished well: copied, connected, reply done. */
export const success = () => fire('success');
export const warning = () => fire('warning');
/** Something failed. */
export const error = () => fire('error');
