import { router, useLocalSearchParams } from 'expo-router';

import { RouteDialog } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { device } from '@/lib/device';

export default function DeleteChat() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const files = useChats((s) => (s.messages[chatId] ?? []).reduce((n, m) => n + m.attachments.filter((a) => !a.inline).length, 0));
  return (
    <RouteDialog
      title="Delete chat?"
      message={`“${chat?.title ?? 'This chat'}”${files ? ` and its ${files === 1 ? 'file' : `${files} files`}` : ''} will be removed from this ${device} and from your next backup. This can't be undone.`}
      confirmLabel="Delete"
      destructive
      onConfirm={async () => { await useChats.getState().remove(chatId); router.dismissAll(); router.replace('/'); }}
    />
  );
}
