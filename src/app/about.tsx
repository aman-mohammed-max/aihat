import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, View } from 'react-native';

import { Box, Icon, ListRow, Screen, SectionTitle, Text } from '@/components';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { useTheme } from '@/theme';

const open = (url: string) => Linking.openURL(url).catch(() => toast('Could not open the link'));

function Side({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text size={12} color="faint" weight="medium" style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>{title}</Text>
      <Text size={14} color="text2" style={{ lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export default function About() {
  const { colors } = useTheme();
  const s = useSettings();
  return (
    <Screen header={{ title: 'About' }} gap={20}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="logo" size={30} color={colors.onAccent} />
        </View>
        <Text size={20} weight="semi">AI Hat</Text>
        <Text mono size={12.5} color="muted">{`v${Constants.expoConfig?.version ?? '0.1.0'} · React Native`}</Text>
      </View>
      <View>
        <SectionTitle>Made by</SectionTitle>
        <Box style={{ borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16, gap: 14, marginTop: 4 }}>
            <View style={{ gap: 2 }}>
              <Text size={18} weight="semi">Aman Mohammed</Text>
              <Text size={13.5} color="text2">Builder · Developer · Exploring business</Text>
              <Text size={12.5} color="muted">India · Remote</Text>
            </View>
            <Side title="Developer" text="JavaScript and TypeScript across Node, Hono, MERN, Astro and Next, and React Native with Expo. Now exploring Go, Rust, AI agents and IoT." />
            <Side title="Business" text="Founder and CEO of Towlips, an early-stage independent fashion brand: clothing, accessories and gadgets, with its own online store." />
        </Box>
      </View>
      <View>
        <ListRow label="Portfolio" value="amanm.space" monoValue onPress={() => open('https://amanm.space')} />
        <ListRow label="Connect" sub="Work together, hire, or just say hi" value="connect.amanm.space" monoValue onPress={() => open('https://connect.amanm.space')} />
        <ListRow label="GitHub" value="aman-mohammed-max" monoValue onPress={() => open('https://github.com/aman-mohammed-max')} />
        <ListRow label="LinkedIn" onPress={() => open('https://www.linkedin.com/in/aman-mohammed-b4001822b/')} />
        <ListRow label="Email" value="connect@amanm.space" monoValue onPress={() => open('mailto:connect@amanm.space')} />
      </View>
      <View>
        <SectionTitle>About the app</SectionTitle>
        <ListRow label="AI Hat on GitHub" sub="Source code, downloads and releases" onPress={() => open('https://github.com/aman-mohammed-max/aihat')} />
        <ListRow label="Report a problem" onPress={() => open('https://github.com/aman-mohammed-max/aihat/issues/new/choose')} />
        <ListRow label="Show the welcome screen again" onPress={() => router.push('/welcome')} />
      </View>
      <View>
        <SectionTitle>Developer</SectionTitle>
        <ListRow label="Developer mode" sub="Raw requests, UI specs, timing" toggle={{ on: s.developerMode, onChange: (developerMode) => s.set({ developerMode }) }} />
      </View>
    </Screen>
  );
}
