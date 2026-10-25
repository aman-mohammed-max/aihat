import { Pressable, View } from 'react-native';

import * as haptic from '@/lib/haptics';
import { useTheme } from '@/theme';

type Props = { on: boolean; onChange: (v: boolean) => void; label: string };

export function Toggle({ on, onChange, label }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={() => { haptic.toggle(!on); onChange(!on); }}
      hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
      style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: on ? colors.accent : colors.border }}>
      <View
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: on ? colors.onAccent : colors.muted,
        }}
      />
    </Pressable>
  );
}
