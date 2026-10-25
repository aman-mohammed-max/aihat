import { Pressable, View } from 'react-native';

import { pauseSpeaking, resumeSpeaking, stopSpeaking } from '@/lib/tts';
import { useSpeech } from '@/store/speech';
import { useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Shows while a reply is being read aloud: pause / resume and stop (cancels even while it is still loading). */
export function SpeechBar() {
  const { colors } = useTheme();
  const { status, canPause } = useSpeech();
  if (status === 'idle') return null;

  const btn = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} color={colors.text} />
    </Pressable>
  );

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ marginHorizontal: 12, marginBottom: 6, minHeight: 48, borderRadius: 24, backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, gap: 4 }}>
      <Icon name="speaker" size={16} color={colors.accent} />
      <Text size={13.5} style={{ flex: 1 }} numberOfLines={1}>
        {status === 'loading' ? 'Preparing audio…' : status === 'paused' ? 'Paused' : 'Reading aloud'}
      </Text>
      {status === 'playing' && canPause ? btn('pause', 'Pause', pauseSpeaking) : null}
      {status === 'paused' ? btn('play', 'Resume', resumeSpeaking) : null}
      {btn('stop', 'Stop reading', stopSpeaking)}
    </View>
  );
}
