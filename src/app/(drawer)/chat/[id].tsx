import { useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '@/components/ChatScreen';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatScreen chatId={id} />;
}
