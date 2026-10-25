import { Redirect } from 'expo-router';

import { ChatScreen } from '@/components/ChatScreen';
import { useSettings } from '@/store/settings';

export default function NewChat() {
  const welcomed = useSettings((s) => s.welcomed);
  if (!welcomed) return <Redirect href="/welcome" />;
  return <ChatScreen />;
}
