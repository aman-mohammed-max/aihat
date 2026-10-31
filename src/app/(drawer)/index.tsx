import { Redirect, type Href } from 'expo-router';

import { ChatScreen } from '@/components/ChatScreen';
import { useSettings } from '@/store/settings';

export default function NewChat() {
  const welcomed = useSettings((s) => s.welcomed);
  if (process.env.EXPO_PUBLIC_PHONON_E2E === '1') return <Redirect href={'/phonon-smoke' as Href} />;
  if (!welcomed) return <Redirect href="/welcome" />;
  return <ChatScreen />;
}
