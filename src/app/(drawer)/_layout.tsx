import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';

import { Sidebar } from '@/components/Sidebar';
import { useTheme } from '@/theme';

export default function DrawerLayout() {
  const { colors } = useTheme();
  return (
    <Drawer
      drawerContent={(p) => <Sidebar {...(p as unknown as DrawerContentComponentProps)} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { width: '86%', backgroundColor: colors.bgDeep },
        overlayColor: colors.scrim,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Drawer.Screen name="index" />
      <Drawer.Screen name="chat/[id]" />
      <Drawer.Screen name="welcome" options={{ swipeEnabled: false }} />
    </Drawer>
  );
}
