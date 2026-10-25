import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';

import { AppShell } from '@/components/AppNav';
import { Sidebar } from '@/components/Sidebar';
import { useLayout } from '@/lib/layout';
import { useTheme } from '@/theme';

/** A drawer on a phone; on a tablet or computer the menu stays on screen (AppShell) and the drawer is never opened. */
export default function DrawerLayout() {
  const { colors } = useTheme();
  const { wide } = useLayout();
  return (
    <AppShell>
      <Drawer
        drawerContent={(p) => <Sidebar {...(p as unknown as DrawerContentComponentProps)} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          swipeEnabled: !wide,
          // A closed drawer still sits just off its edge; on wide screens that edge is beside the menu, so hide it.
          drawerStyle: wide ? { display: 'none' } : { width: '86%', backgroundColor: colors.bgDeep },
          overlayColor: colors.scrim,
          sceneStyle: { backgroundColor: colors.bg },
        }}>
        <Drawer.Screen name="index" />
        <Drawer.Screen name="chat/[id]" />
        <Drawer.Screen name="welcome" options={{ swipeEnabled: false }} />
      </Drawer>
    </AppShell>
  );
}
