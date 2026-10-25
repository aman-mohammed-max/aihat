import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/store/toast';
import { useTheme } from '@/theme';

import { Text } from './Text';

/** Fades a short message in above the chat box, then out again. Mounted once at the root. */
export function Toast() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, text } = useToast();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!id) return;
    opacity.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [id, opacity]);

  if (!id) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 120, alignItems: 'center', paddingHorizontal: 24, zIndex: 50 }}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={{
          opacity,
          transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          backgroundColor: colors.selected,
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 10,
          maxWidth: '100%',
        }}>
        <Text size={13.5}>{text}</Text>
      </Animated.View>
    </View>
  );
}
