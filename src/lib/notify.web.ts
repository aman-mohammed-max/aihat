// Desktop app: a reply that finishes while you're in another window or another chat shows a system notification
// (through the app's Bun backend).
import { useSettings } from '@/store/settings';

export { previewOf } from './preview';

let viewing: string | null = null;

/** The chat that is open on screen right now (null when none). A reply in that chat doesn't need a banner. */
export function setViewing(chatId: string | null) {
  viewing = chatId;
}

export function initNotifications() {
  return () => {};
}

/** The desktop app always can (through its backend). */
export const notificationsAvailable = () => true;

/** Desktop notifications need no permission prompt. */
export async function ensureNotifyPermission() {
  return useSettings.getState().notifyReplies;
}

export async function notifyReply(chatId: string, title: string, body: string) {
  if (!useSettings.getState().notifyReplies) return;
  if (document.hasFocus() && viewing === chatId) return;
  try {
    await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title || 'AI Hat', body }) });
  } catch {
    /* a notification is a courtesy; never break the chat over it */
  }
}
