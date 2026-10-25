import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardVisible } from '@/lib/keyboard';
import { useLayout, useNavWidth } from '@/lib/layout';
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
  /** On a tablet or computer, open as a popover under the chat's model button instead of a centred dialog. */
  popover?: boolean;
};

/** Desktop: Esc closes the sheet or dialog in front. Capture phase, because text fields stop keys from bubbling. */
export function useEscape(onEscape: (() => void) | null) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !onEscape) return;
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onEscape();
    };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  }, [onEscape]);
}

/** A bottom sheet on a phone; a centred dialog (or a popover) on a tablet or computer. */
export function BottomSheet(props: SheetProps) {
  const { wide } = useLayout();
  return wide ? <DialogSheet {...props} /> : <PhoneSheet {...props} />;
}

/** Tablet and desktop: the same sheet as a 520 px dialog (380 px popover), fading in. Esc, Done or a click outside closes it. */
function DialogSheet({ onClose, title, children, footer, popover }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navWidth = useNavWidth();
  const [shown] = useState(() => new Animated.Value(0));
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    Animated.timing(shown, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [shown]);
  const [close] = useState(() => () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(shown, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => onCloseRef.current());
  });
  useEscape(close);

  return (
    <KeyboardAvoidingView behavior={'padding'} style={{ flex: 1, alignItems: popover ? 'flex-start' : 'center', justifyContent: popover ? 'flex-start' : 'center', padding: 24 }}>
      <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: popover ? 'transparent' : colors.scrim }} />
      <Animated.View
        accessibilityViewIsModal
        style={[
          {
            width: popover ? 380 : 520,
            maxWidth: '100%',
            maxHeight: popover ? '78%' : '84%',
            backgroundColor: colors.surface,
            borderRadius: popover ? 18 : radii.dialog,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            opacity: shown,
            transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
          },
          popover ? { position: 'absolute', top: insets.top + 52, left: navWidth + 12 } : null,
          Platform.OS === 'web' ? ({ boxShadow: '0 24px 60px rgba(0,0,0,0.55)' } as object) : { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 20 },
        ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: 10, paddingBottom: 4 }}>
          <Text size={popover ? 15 : 17} weight="semi" style={{ flex: 1 }}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={close} style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text color="accent" weight="semi">Done</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
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

/**
 * Scrim + surface sheet, r28 top, grabber, title row with accent Done, content scrolls.
 * Close: Done, tap the scrim, or drag down. Lifts above the keyboard so inputs stay visible.
 */
function PhoneSheet({ onClose, title, children, footer }: SheetProps) {
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
  useEscape(visible ? onClose : null);
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
