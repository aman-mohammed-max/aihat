import { router } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';

import { useSettings } from '@/store/settings';

export { previewOf } from './preview';

/**
 * The parts of expo-notifications this app uses (local notifications only), loaded on first use.
 *
 * Not the package's entry file: that one also loads the push-topic module, which Expo Go on Android doesn't have, and
 * fails there even though local notifications work. The native modules these parts need are checked first (a check
 * that can't throw), so a phone without them simply gets no reply notifications. The APK and IPA have everything.
 */
type Mod = {
  setNotificationHandler: typeof import('expo-notifications/build/NotificationsHandler').setNotificationHandler;
  addNotificationResponseReceivedListener: typeof import('expo-notifications/build/NotificationsEmitter').addNotificationResponseReceivedListener;
  getLastNotificationResponseAsync: typeof import('expo-notifications/build/NotificationsEmitter').getLastNotificationResponseAsync;
  getPermissionsAsync: typeof import('expo-notifications/build/NotificationPermissions').getPermissionsAsync;
  requestPermissionsAsync: typeof import('expo-notifications/build/NotificationPermissions').requestPermissionsAsync;
  scheduleNotificationAsync: typeof import('expo-notifications/build/scheduleNotificationAsync').scheduleNotificationAsync;
  setNotificationChannelAsync: typeof import('expo-notifications/build/setNotificationChannelAsync').setNotificationChannelAsync;
  AndroidImportance: typeof import('expo-notifications/build/NotificationChannelManager.types').AndroidImportance;
};
let cached: Mod | null | undefined;

const NATIVE = ['ExpoNotificationsHandlerModule', 'ExpoNotificationsEmitter', 'ExpoNotificationPermissionsModule', 'ExpoNotificationScheduler'];

function notifications(): Mod | null {
  if (cached !== undefined) return cached;
  const native = Platform.OS === 'android' ? [...NATIVE, 'ExpoNotificationChannelManager'] : NATIVE;
  if (!native.every((n) => requireOptionalNativeModule(n))) return (cached = null);
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const handler = require('expo-notifications/build/NotificationsHandler');
    const emitter = require('expo-notifications/build/NotificationsEmitter');
    const perms = require('expo-notifications/build/NotificationPermissions');
    const types = require('expo-notifications/build/NotificationChannelManager.types');
    cached = {
      setNotificationHandler: handler.setNotificationHandler,
      addNotificationResponseReceivedListener: emitter.addNotificationResponseReceivedListener,
      getLastNotificationResponseAsync: emitter.getLastNotificationResponseAsync,
      getPermissionsAsync: perms.getPermissionsAsync,
      requestPermissionsAsync: perms.requestPermissionsAsync,
      scheduleNotificationAsync: require('expo-notifications/build/scheduleNotificationAsync').scheduleNotificationAsync,
      setNotificationChannelAsync: require('expo-notifications/build/setNotificationChannelAsync').setNotificationChannelAsync,
      AndroidImportance: types.AndroidImportance,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    cached = null;
  }
  return cached;
}

const CHANNEL = 'replies';
let viewing: string | null = null;

/** The chat that is open on screen right now (null when none). A reply in that chat doesn't need a banner. */
export function setViewing(chatId: string | null) {
  viewing = chatId;
}

/** Call once at start-up: how banners look while the app is open, the Android channel, and what a tap does. */
export function initNotifications() {
  const N = notifications();
  if (!N) return () => {};
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      N.setNotificationChannelAsync(CHANNEL, { name: 'Finished replies', importance: N.AndroidImportance.DEFAULT, vibrationPattern: [0, 120], showBadge: false }).catch(() => {});
    }
    const open = (r: import('expo-notifications').NotificationResponse | null) => {
      const id = r?.notification.request.content.data?.chatId;
      if (typeof id === 'string') router.push({ pathname: '/chat/[id]', params: { id } });
    };
    const sub = N.addNotificationResponseReceivedListener(open);
    N.getLastNotificationResponseAsync().then(open).catch(() => {});
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

/** Whether this build can show reply notifications at all (not in Expo Go on Android, nor on a computer). */
export const notificationsAvailable = () => !!notifications();

/** Ask for permission the first time a message is sent (the system asks only once; later calls are free). */
export async function ensureNotifyPermission() {
  const N = notifications();
  if (!N || !useSettings.getState().notifyReplies) return false;
  try {
    const cur = await N.getPermissionsAsync();
    if (cur.granted) return true;
    if (cur.status !== 'undetermined') return false;
    return (await N.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Tell the user a reply is ready, when they are away from it: the app is in the background, or they are looking
 * at a different chat. Only fires while the app process is alive (iOS pauses apps shortly after you leave).
 */
export async function notifyReply(chatId: string, title: string, body: string) {
  const N = notifications();
  if (!N || !useSettings.getState().notifyReplies) return;
  if (AppState.currentState === 'active' && viewing === chatId) return;
  try {
    if (!(await N.getPermissionsAsync()).granted) return;
    await N.scheduleNotificationAsync({
      content: { title: title || 'AI Hat', body, data: { chatId }, ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) } as import('expo-notifications').NotificationContentInput,
      trigger: null,
    });
  } catch {
    /* a notification is a courtesy; never break the chat over it */
  }
}
