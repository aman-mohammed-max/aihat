import { ImageOptionsForm, Screen, Text } from '@/components';

export default function Images() {
  return (
    <Screen header={{ title: 'Images' }}>
      <ImageOptionsForm showWorkflow />
      <Text size={12} color="muted">In a chat, turn on the Image chip (＋ → Create an image), then tap it to change these for that message.</Text>
    </Screen>
  );
}
