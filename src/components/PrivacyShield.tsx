import * as LocalAuth from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Button } from './Controls';
import { Text } from './Text';

/**
 * Covers the app (1) in the app switcher when "Hide chats in the app switcher" is on, and
 * (2) behind Face ID / fingerprint when "Lock" is on: at launch and every time the app returns from the background.
 */
export function PrivacyShield() {
  const { colors } = useTheme();
  const lock = useSettings((s) => s.appLock);
  const hide = useSettings((s) => s.hideInSwitcher);
  const [locked, setLocked] = useState(lock);
  const [covered, setCovered] = useState(false);
  const busy = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await LocalAuth.authenticateAsync({ promptMessage: 'Unlock AI Hat', fallbackLabel: 'Use passcode' });
      if (r.success) setLocked(false);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (lock && locked) unlock();
  }, [lock, locked, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setCovered(state !== 'active');
      if (state === 'background' && useSettings.getState().appLock) setLocked(true);
      if (state === 'active' && useSettings.getState().appLock) unlock();
    });
    return () => sub.remove();
  }, [unlock]);

  const showLock = lock && locked;
  if (!showLock && !(hide && covered)) return null;

  return (
    <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 100 }}>
      <Icon name="logo" size={36} color={colors.accent} />
      {showLock ? (
        <>
          <Text color="muted">AI Hat is locked</Text>
          <Button label="Unlock" onPress={unlock} />
        </>
      ) : null}
    </View>
  );
}
