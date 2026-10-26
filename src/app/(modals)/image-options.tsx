import { router } from 'expo-router';

import { ImageOptionsForm } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';

/** Opened by tapping the Image chip in the chat box. */
export default function ImageOptionsSheet() {
  return (
    <RouteSheet title="Image options" footer={[{ label: 'Use these options', onPress: () => router.back(), primary: true }]}>
      <ImageOptionsForm />
    </RouteSheet>
  );
}
