import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';

import { useSettings } from '@/store/settings';

const CHANNEL = 'replies';
let viewing: string | null = null;

/** The chat that is open on screen right now (null when none). A reply in that chat doesn't need a banner. */
export function setViewing(chatId: string | null) {
  viewing = chatId;
}

/** Call once at start-up: how banners look while the app is open, the Android channel, and what a tap does. */
export function initNotifications() {
  if (Platform.OS === 'web') return () => {};
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Finished replies', importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 120], showBadge: false }).catch(() => {});
  }
  const open = (r: Notifications.NotificationResponse | null) => {
    const id = r?.notification.request.content.data?.chatId;
    if (typeof id === 'string') router.push({ pathname: '/chat/[id]', params: { id } });
  };
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
  return () => sub.remove();
}

/** Ask for permission the first time a message is sent (the system asks only once; later calls are free). */
export async function ensureNotifyPermission() {
  if (Platform.OS === 'web' || !useSettings.getState().notifyReplies) return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (cur.status !== 'undetermined' && !cur.canAskAgain) return false;
    if (cur.status !== 'undetermined') return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Plain text for a banner: no markdown, no reasoning block, no UI spec. */
export function previewOf(markdown: string, max = 140) {
  const t = markdown
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/```spec[\s\S]*?(```|$)/g, '')
    .replace(/```[\s\S]*?(```|$)/g, ' [code] ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Tell the user a reply is ready, when they are away from it: the app is in the background, or they are looking
 * at a different chat. Only fires while the app process is alive (iOS pauses apps shortly after you leave).
 */
export async function notifyReply(chatId: string, title: string, body: string) {
  if (Platform.OS === 'web' || !useSettings.getState().notifyReplies) return;
  if (AppState.currentState === 'active' && viewing === chatId) return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: title || 'AI Hat', body, data: { chatId }, ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) } as Notifications.NotificationContentInput,
      trigger: null,
    });
  } catch {
    /* a notification is a courtesy; never break the chat over it */
  }
}
