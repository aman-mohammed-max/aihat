import Constants from 'expo-constants';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, Icon, ListRow, Screen, SectionTitle, Text } from '@/components';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

export default function About() {
  const { colors } = useTheme();
  const s = useSettings();
  return (
    <Screen header={{ title: 'About' }}>
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="logo" size={30} color={colors.onAccent} />
        </View>
        <Text size={20} weight="semi">AI Hat</Text>
        <Text size={13} color="muted">v{Constants.expoConfig?.version ?? '1.0.0'} · React Native</Text>
      </View>
      <Card>
        <ListRow label="Show the welcome screen again" onPress={() => router.push('/welcome')} last />
      </Card>
      <View>
        <SectionTitle>Developer</SectionTitle>
        <Card>
          <ListRow label="Developer mode" sub="Raw requests, UI specs, timing" toggle={{ on: s.developerMode, onChange: (developerMode) => s.set({ developerMode }) }} last />
        </Card>
      </View>
    </Screen>
  );
}
