import { router, useLocalSearchParams } from 'expo-router';

import { RouteDialog } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { device } from '@/lib/device';

export default function DeleteChat() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  return (
    <RouteDialog
      title="Delete chat?"
      message={`“${chat?.title ?? 'This chat'}” will be removed from this ${device} and from your next backup. This can't be undone.`}
      confirmLabel="Delete"
      destructive
      onConfirm={async () => { await useChats.getState().remove(chatId); router.dismissAll(); router.replace('/'); }}
    />
  );
}
