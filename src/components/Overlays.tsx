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

import { Button, OnSheet } from './Controls';
import { Text } from './Text';

type SheetProps = {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Two outline buttons at the foot of the sheet. */
  footer?: { label: string; onPress: () => void; primary?: boolean }[];
  /** Kept for call-site compatibility; the sheet sizes to its content up to 88% of the screen. */
  snapPoints?: (string | number)[];
  /** On a tablet or computer, open as a popover under the chat's model button instead of a centred dialog. */
  popover?: boolean;
  /** No title row: the grabber and the content only (the title is still read out by screen readers). */
  bare?: boolean;
  /** On a phone, shown on its own above the sheet (the message a message menu is for). */
  above?: React.ReactNode;
  /** A line under the title, in the code font (the model the settings are for). */
  sub?: string;
  /** A hairline above the footer buttons. */
  footerLine?: boolean;
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
function DialogSheet({ onClose, title, children, footer, popover, bare, sub, footerLine }: SheetProps) {
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
        accessibilityLabel={title}
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
        {bare ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={popover ? 15 : 17} weight="semi">{title}</Text>
              {sub ? <Text mono size={12} color="muted" numberOfLines={1}>{sub}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" onPress={close} style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 }}>
              <Text color="accent" weight="semi">Done</Text>
            </Pressable>
          </View>
        )}
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: bare ? 12 : 0, paddingBottom: 16, gap: 14 }}>
          <OnSheet.Provider value>{children}</OnSheet.Provider>
        </ScrollView>
        {footer ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: footerLine ? 1 : 0, borderTopColor: colors.surface2 }}>
            {footer.map((b) => (
              <Button key={b.label} label={b.label} variant={b.primary ? 'primary' : 'outline'} height={b.primary ? 48 : 44} textSize={b.primary ? 15 : 14} onPress={b.onPress} flex />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

/**
 * Scrim + surface sheet, r28 top, grabber, title row with accent Done, content scrolls.
 * Close: Done, tap the scrim, or drag down. Lifts above the keyboard so inputs stay visible.
 */
function PhoneSheet({ onClose, title, children, footer, bare, above, sub, footerLine }: SheetProps) {
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
      {above ? (
        <Animated.View pointerEvents="box-none" style={{ flex: 1, overflow: 'hidden', paddingTop: insets.top + 68, paddingHorizontal: 16, paddingBottom: 12, opacity: y.interpolate({ inputRange: [0, height / 3], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
          {above}
        </Animated.View>
      ) : null}
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={title}
        style={{
          transform: [{ translateY: y }],
          maxHeight: '88%',
          backgroundColor: colors.surface,
          borderTopLeftRadius: radii.sheet,
          borderTopRightRadius: radii.sheet,
          paddingBottom: keyboard ? 8 : Math.max(insets.bottom, 12),
        }}>
        <View {...pan.panHandlers} style={{ paddingTop: 8, paddingBottom: bare ? 6 : 0 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.grabber }} />
          {bare ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 6 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text size={17} weight="semi">{title}</Text>
                {sub ? <Text mono size={12} color="muted" numberOfLines={1}>{sub}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" onPress={close} style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 12 }}>
                <Text color="accent" weight="semi">Done</Text>
              </Pressable>
            </View>
          )}
        </View>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 14 }}>
          <OnSheet.Provider value>{children}</OnSheet.Provider>
        </ScrollView>
        {footer ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, borderTopWidth: footerLine ? 1 : 0, borderTopColor: colors.surface2 }}>
            {footer.map((b) => (
              <Button key={b.label} label={b.label} variant={b.primary ? 'primary' : 'outline'} height={b.primary ? 48 : 44} textSize={b.primary ? 15 : 14} onPress={b.onPress} flex />
            ))}
          </View>
        ) : null}
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
          <Pressable accessible={false} accessibilityRole={destructive ? 'alert' : undefined} style={{ width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radii.dialog, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 18, gap: message && !children ? 10 : 14 }}>
            <Text size={18} weight="semi">{title}</Text>
            {message ? <Text size={14.5} color="muted" style={{ lineHeight: 21.75 }}>{message}</Text> : null}
            {children}
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: message && !children ? 10 : 4 }}>
              <Button label={cancelLabel} variant="outline" onPress={onClose} flex />
              <Button label={confirmLabel} variant={destructive ? 'dangerFill' : 'primary'} onPress={onConfirm} flex />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
