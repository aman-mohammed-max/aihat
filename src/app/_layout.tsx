import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/lib/alerts';
import '@/lib/webstyle';
import { AlertHost } from '@/components/AlertHost';
import { PrivacyShield } from '@/components/PrivacyShield';
import { autoBackupIfDue } from '@/lib/backup';
import { updateSkillsIfDue } from '@/lib/skill-updates';
import { SkillRuntimeHost } from '@/skill-exec/runtime';
import { isDesktop } from '@/lib/device';
import { useLayout } from '@/lib/layout';
import { initNotifications } from '@/lib/notify';
import { lockPhonesUpright } from '@/lib/orientation';
import { useDesktopShortcuts } from '@/lib/shortcuts';
import { Toast } from '@/components/Toast';
import { useChats } from '@/store/chats';
import { useCommands } from '@/store/commands';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

// react-native-drawer-layout passes dependency arrays that Reanimated 4 ignores on native; the warning is noise.
configureReanimatedLogger({ level: ReanimatedLogLevel.error, strict: false });

SplashScreen.preventAutoHideAsync();
lockPhonesUpright();

const sheet = { presentation: 'transparentModal', animation: 'fade', headerShown: false, contentStyle: { backgroundColor: 'transparent' } } as const;

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, GeistMono_400Regular, GeistMono_500Medium });
  const [dataReady, setDataReady] = useState(false);
  const { wide } = useLayout();
  useDesktopShortcuts();

  useEffect(() => {
    Promise.all([useSettings.getState().load(), useProviders.getState().load(), useLibrary.getState().load(), useCommands.getState().load()])
      .then(() => useChats.getState().housekeeping())
      .then(() => autoBackupIfDue())
      .catch(() => {})
      .finally(() => {
        setDataReady(true);
        updateSkillsIfDue().catch(() => {});
      });
  }, []);

  const ready = (fontsLoaded || fontError) && dataReady;
  useEffect(() => (ready ? initNotifications() : undefined), [ready]);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {!isDesktop && <PrivacyShield />}
          <Toast />
          <SkillRuntimeHost />
          {/* On a tablet or computer the side menu stays put between pages, so pages swap in place instead of sliding. */}
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: wide ? 'fade' : 'default', title: 'AI Hat' }}>
            <Stack.Screen name="(drawer)" />
            <Stack.Screen name="about" />
            <Stack.Screen name="add-mcp" />
            <Stack.Screen name="add-provider" />
            <Stack.Screen name="add-skill" />
            <Stack.Screen name="appearance" />
            <Stack.Screen name="audio" />
            <Stack.Screen name="backup" />
            <Stack.Screen name="chat-defaults" />
            <Stack.Screen name="command-edit" />
            <Stack.Screen name="commands" />
            <Stack.Screen name="connector-auth" />
            <Stack.Screen name="connectors" />
            <Stack.Screen name="files" />
            <Stack.Screen name="gen-app" />
            <Stack.Screen name="gen-catalog" />
            <Stack.Screen name="gen-settings" />
            <Stack.Screen name="gen-spec" />
            <Stack.Screen name="image-viewer" />
            <Stack.Screen name="images" />
            <Stack.Screen name="market" />
            <Stack.Screen name="market-mcp" />
            <Stack.Screen name="market-skill" />
            <Stack.Screen name="oauth/mcp" />
            <Stack.Screen name="mcp" />
            <Stack.Screen name="mcp-detail" />
            <Stack.Screen name="privacy" />
            <Stack.Screen name="prompt-edit" />
            <Stack.Screen name="prompts" />
            <Stack.Screen name="provider-detail" />
            <Stack.Screen name="providers" />
            <Stack.Screen name="search-chats" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="skill-detail" />
            <Stack.Screen name="skill-file" />
            <Stack.Screen name="skill-scripts" />
            <Stack.Screen name="skills" />
            <Stack.Screen name="web-search" />
            {/* Every sheet / dialog is a transparent modal over the current screen. */}
            <Stack.Screen name="(modals)/model-sheet" options={sheet} />
            <Stack.Screen name="(modals)/image-options" options={sheet} />
            <Stack.Screen name="(modals)/model-edit" options={sheet} />
            <Stack.Screen name="(modals)/prompt-sheet" options={sheet} />
            <Stack.Screen name="(modals)/chat-menu" options={sheet} />
            <Stack.Screen name="(modals)/params-sheet" options={sheet} />
            <Stack.Screen name="(modals)/message-sheet" options={sheet} />
            <Stack.Screen name="(modals)/tools-sheet" options={sheet} />
            <Stack.Screen name="(modals)/rename" options={sheet} />
            <Stack.Screen name="(modals)/delete-chat" options={sheet} />
            <Stack.Screen name="(modals)/picker" options={sheet} />
            <Stack.Screen name="(modals)/attach-sheet" options={sheet} />
            <Stack.Screen name="(modals)/sources-sheet" options={sheet} />
            <Stack.Screen name="(modals)/gen-action" options={sheet} />
            <Stack.Screen name="(modals)/tool-detail" options={sheet} />
            <Stack.Screen name="(modals)/palette" options={sheet} />
          </Stack>
          <AlertHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
