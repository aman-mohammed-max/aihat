import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardVisible } from '@/lib/keyboard';
import { radii, useTheme } from '@/theme';

import { Button } from './Controls';
import { Text } from './Text';

type SheetProps = {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Two outline buttons at the foot of the sheet. */
  footer?: { label: string; onPress: () => void }[];
  /** Kept for call-site compatibility; the sheet sizes to its content up to 88% of the screen. */
  snapPoints?: (string | number)[];
};

/**
 * Scrim + surface sheet, r28 top, grabber, title row with accent Done, content scrolls.
 * Close: Done, tap the scrim, or drag down. Lifts above the keyboard so inputs stay visible.
 */
export function BottomSheet({ onClose, title, children, footer }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const { height } = useWindowDimensions();
  const [y] = useState(() => new Animated.Value(height));
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    Animated.timing(y, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [y]);

  const [slideOut] = useState(() => () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(y, { toValue: height, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onCloseRef.current());
  });

  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) y.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.8) slideOut();
        else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  );
  const close = slideOut;

  return (
    <KeyboardAvoidingView behavior={'padding'} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} />
      <Animated.View
        style={{
          transform: [{ translateY: y }],
          maxHeight: '88%',
          backgroundColor: colors.surface,
          borderTopLeftRadius: radii.sheet,
          borderTopRightRadius: radii.sheet,
          paddingBottom: keyboard ? 8 : Math.max(insets.bottom, 12),
        }}>
        <View {...pan.panHandlers} style={{ paddingTop: 8 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 6 }}>
            <Text size={17} weight="semi" style={{ flex: 1 }}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={close} style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text color="accent" weight="semi">Done</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }}>
          {children}
          {footer ? (
            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
              {footer.map((b) => (
                <Button key={b.label} label={b.label} variant="outline" onPress={b.onPress} flex />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

type DialogProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  children?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
};

/** Centred surface r24 card with a two-button footer; moves up with the keyboard. */
export function Dialog({ visible, onClose, title, message, children, cancelLabel = 'Cancel', confirmLabel, onConfirm, destructive }: DialogProps) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={'padding'} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Dismiss" onPress={onClose} style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Pressable accessible={false} style={{ width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radii.dialog, padding: 20, gap: 14 }}>
            <Text size={18} weight="semi">{title}</Text>
            {message ? <Text color="text2">{message}</Text> : null}
            {children}
            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
              <Button label={cancelLabel} variant="outline" onPress={onClose} flex />
              <Button label={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} flex />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
