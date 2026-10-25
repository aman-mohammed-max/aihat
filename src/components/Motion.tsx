import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

/** Three dots that pulse one after another. */
export function PulseDots({ color }: { color?: string }) {
  const { colors } = useTheme();
  const [vals] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.25)));
  useEffect(() => {
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [vals]);
  return (
    <View accessibilityElementsHidden style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color ?? colors.muted, opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0.25, 1], outputRange: [0.8, 1.15] }) }] }} />
      ))}
    </View>
  );
}

/** A status line ("Thinking…", "Improving your prompt…") whose text gently breathes, with pulsing dots. */
export function StatusLine({ text }: { text: string }) {
  const [o] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }}>
      <Animated.View style={{ opacity: o }}>
        <Text color="muted">{text}</Text>
      </Animated.View>
      <PulseDots />
    </View>
  );
}
