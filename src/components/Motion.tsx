import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
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

const activityIcon = (status: string): IconName => {
  if (/web/i.test(status)) return 'globe';
  if (/image|prompt/i.test(status)) return 'image';
  if (/file|reading/i.test(status)) return 'file';
  if (/running|ok/i.test(status)) return 'tool';
  return 'sparkle';
};

/**
 * What the app is doing while a reply is on its way: a small card with an icon, the step ("Searching the web…",
 * "Generating image…"), a running timer and, underneath, what it is working on (the query, the improved prompt).
 */
export function ActivityBox({ status, detail, since }: { status: string; detail?: string; since: number }) {
  const { colors } = useTheme();
  const [secs, setSecs] = useState(() => Math.max(0, Math.round((Date.now() - since) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.max(0, Math.round((Date.now() - since) / 1000))), 1000);
    return () => clearInterval(t);
  }, [since]);
  const [glow] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={detail ? `${status} ${detail}` : status}
      accessibilityLiveRegion="polite"
      style={{ alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Animated.View style={{ opacity: glow, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={activityIcon(status)} size={15} color={colors.accent} />
        </Animated.View>
        <Text weight="medium" size={14} style={{ flexShrink: 1 }} numberOfLines={1}>{status}</Text>
        <PulseDots />
        {secs >= 2 && <Text size={12.5} color="faint" style={{ fontVariant: ['tabular-nums'] }}>{secs}s</Text>}
      </View>
      {!!detail && <Text size={12.5} color="muted" numberOfLines={3} style={{ marginLeft: 38 }}>{detail}</Text>}
    </View>
  );
}
