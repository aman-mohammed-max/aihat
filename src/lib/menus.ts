/**
 * What right-click shows, for a chat in the side menu and for a message. Android tablets, Chromebooks and the desktop
 * app draw these in the app's own menu (components/ContextMenu); iPads show them in the system menu.
 */
import type { ButtonProps } from '@expo/ui/swift-ui';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Alert, Platform, Share } from 'react-native';

import type { IconName } from '@/components/Icon';
import * as haptic from '@/lib/haptics';
import { submit } from '@/lib/send';
import { exportText } from '@/lib/share';
import { speak } from '@/lib/tts';
import { useChats } from '@/store/chats';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';

/** One row: the app's icon, and `sf`, the matching SF Symbol for the iPad's menu. */
export type MenuItem = { label: string; icon: IconName; sf: NonNullable<ButtonProps['systemImage']>; onPress: () => void | Promise<unknown>; danger?: boolean; hint?: string };
/** A menu's rows; `null` draws a divider. */
export type Menu = (MenuItem | null)[];

/** Drops dividers at the ends and doubled ones, left when a row doesn't apply. */
export const tidy = (menu: Menu) => menu.filter((m, i, all) => m || (i > 0 && i < all.length - 1 && all[i - 1] !== null && all.slice(i + 1).some(Boolean)));

const withoutThoughts = (s: string) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();

export function messageMenu(chatId: string, messageId: string): Menu {
  const msg = useChats.getState().messages[chatId]?.find((m) => m.id === messageId);
  if (!msg) return [];
  const text = withoutThoughts(msg.content);
  const translateTo = useSettings.getState().translateTo;
  const copy: MenuItem = { label: 'Copy', icon: 'copy', sf: 'doc.on.doc', onPress: async () => { await Clipboard.setStringAsync(text); haptic.success(); toast('Copied'); } };
  return [
    ...(text ? [copy] : []),
    ...(text && Platform.OS !== 'web' ? [{ label: 'Select text', icon: 'text', sf: 'character.cursor.ibeam', onPress: () => router.push({ pathname: '/select-text', params: { chatId, messageId } }) } satisfies MenuItem] : []),
    ...(text ? [{ label: 'Read aloud', icon: 'speaker', sf: 'speaker.wave.2', onPress: () => speak(text).catch((e) => Alert.alert('Could not read aloud', e.message)) } satisfies MenuItem] : []),
    null,
    ...(msg.role === 'assistant' ? [{ label: 'Retry with another model', icon: 'refresh', sf: 'arrow.clockwise', onPress: () => router.push({ pathname: '/model-sheet', params: { chatId } }) } satisfies MenuItem] : []),
    { label: 'Branch into new chat', icon: 'branch', sf: 'arrow.triangle.branch', onPress: async () => router.push(`/chat/${await useChats.getState().branch(chatId, messageId)}`) },
    ...(text ? [{ label: `Translate to ${translateTo}`, icon: 'translate', sf: 'character.bubble', onPress: () => submit(chatId, `Translate this into ${translateTo}. Keep formatting, code and names unchanged.\n\n${text}`) } satisfies MenuItem] : []),
    null,
    { label: 'Save as a file', icon: 'cloud', sf: 'square.and.arrow.down', onPress: () => exportText(`message-${messageId.slice(0, 6)}.md`, text) },
    ...(Platform.OS !== 'web' && text ? [{ label: 'Share', icon: 'shareBox', sf: 'square.and.arrow.up', onPress: () => Share.share({ message: text }) } satisfies MenuItem] : []),
    null,
    { label: 'Delete message', icon: 'trash', sf: 'trash', danger: true, onPress: () => useChats.getState().deleteMessage(chatId, messageId) },
  ];
}

export function chatMenu(chatId: string): Menu {
  const chat = useChats.getState().chats.find((c) => c.id === chatId);
  if (!chat) return [];
  const open = (pathname: string) => router.push({ pathname, params: { chatId } } as never);
  const exportMd = () => {
    const msgs = useChats.getState().messages[chatId] ?? [];
    const md = `# ${chat.title}\n\n` + msgs.map((m) => `**${m.role === 'user' ? 'You' : 'Assistant'}**\n\n${withoutThoughts(m.content)}`).join('\n\n---\n\n');
    return exportText(`${chat.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'chat'}.md`, md);
  };
  return [
    { label: 'Rename…', icon: 'edit', sf: 'pencil', onPress: () => open('/rename') },
    { label: chat.pinned ? 'Unpin' : 'Pin to top', icon: 'pin', sf: chat.pinned ? 'pin.slash' : 'pin', onPress: () => useChats.getState().patch(chatId, { pinned: !chat.pinned }) },
    { label: chat.archived ? 'Unarchive' : 'Archive', icon: 'archive', sf: 'archivebox', onPress: () => useChats.getState().patch(chatId, { archived: !chat.archived }) },
    null,
    { label: 'System prompt…', icon: 'prompt', sf: 'text.alignleft', onPress: () => open('/prompt-sheet') },
    { label: 'Model settings…', icon: 'sliders', sf: 'slider.horizontal.3', onPress: () => open('/params-sheet') },
    { label: 'Tools…', icon: 'tool', sf: 'wrench.and.screwdriver', onPress: () => open('/tools-sheet') },
    { label: 'Export as Markdown', icon: 'share', sf: 'square.and.arrow.up', onPress: exportMd },
    null,
    { label: 'Delete chat…', icon: 'trash', sf: 'trash', danger: true, onPress: () => open('/delete-chat') },
  ];
}
