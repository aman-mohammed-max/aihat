import { ImageOptionsForm, Screen } from '@/components';

export default function Images() {
  return (
    <Screen header={{ title: 'Images' }} gap={16}>
      <ImageOptionsForm showWorkflow page />
    </Screen>
  );
}
