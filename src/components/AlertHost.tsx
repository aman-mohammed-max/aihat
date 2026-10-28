import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View, type AlertButton } from 'react-native';
import { create } from 'zustand';

import { fonts, radii, useTheme } from '@/theme';

import { Text } from './Text';

type Item = { id: number; title: string; message?: string; buttons: AlertButton[]; prompt?: { value: string; onText?: (t: string) => void } };

const useAlerts = create<{ queue: Item[] }>(() => ({ queue: [] }));
let next = 1;

/** Queue an alert: the app's own dialog, used instead of the system alert on every platform (see lib/alerts.ts). */
export function showAlert(title: string, message?: string, buttons?: AlertButton[], prompt?: Item['prompt']) {
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  useAlerts.setState((s) => ({ queue: [...s.queue, { id: next++, title, message, buttons: list, prompt }] }));
}

const dismiss = (id: number) => useAlerts.setState((s) => ({ queue: s.queue.filter((a) => a.id !== id) }));

/** Shows queued alerts one at a time, centred, with Esc for cancel and Enter for the main button. */
export function AlertHost() {
  const top = useAlerts((s) => s.queue[0]);
  return top ? <AlertCard key={top.id} item={top} /> : null;
}

function AlertCard({ item }: { item: Item }) {
  const { colors, body, isDark } = useTheme();
  const [text, setText] = useState(item.prompt?.value ?? '');

  const press = useCallback(
    (b: AlertButton) => {
      dismiss(item.id);
      if (item.prompt && b.style !== 'cancel') (item.prompt.onText ?? (b.onPress as ((t: string) => void) | undefined))?.(text);
      else b.onPress?.();
    },
    [item, text],
  );

  useEffect(() => {
    // Desktop: Esc cancels, Enter presses the main button. Capture phase: text fields stop key events bubbling up.
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        const cancel = item.buttons.find((b) => b.style === 'cancel');
        if (cancel) press(cancel);
        else dismiss(item.id);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        press([...item.buttons].reverse().find((b) => b.style !== 'cancel') ?? item.buttons[0]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, press]);

  const cancel = () => {
    const c = item.buttons.find((b) => b.style === 'cancel');
    if (c) press(c);
    else if (item.buttons.length === 1) press(item.buttons[0]);
  };
  // Two buttons sit side by side (cancel first); one or three-plus stack, the main one on top.
  const side = item.buttons.length === 2;
  const ordered = side ? [...item.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : b.style === 'cancel' ? 1 : 0)) : [...item.buttons].reverse();
  const card = (
    <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Pressable accessibilityLabel="Close" onPress={cancel} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View accessibilityRole="alert" accessibilityViewIsModal style={{ width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radii.dialog, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 18, gap: 10, borderWidth: 1, borderColor: colors.hairline }}>
        <Text size={18} weight="semi">{item.title}</Text>
        {item.message ? <Text color="muted" size={14.5} selectable style={{ lineHeight: 21.75 }}>{item.message}</Text> : null}
        {item.prompt ? (
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            accessibilityLabel={item.title}
            selectionColor={colors.accent}
            onSubmitEditing={() => press([...item.buttons].reverse().find((b) => b.style !== 'cancel') ?? item.buttons[0])}
            style={{ height: 46, marginTop: 4, borderRadius: radii.input, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 12, fontSize: body, fontFamily: fonts.ui }}
          />
        ) : null}
        <View style={{ flexDirection: side ? 'row' : 'column', gap: 8, paddingTop: 10 }}>
          {ordered.map((b, i) => {
            const isCancel = b.style === 'cancel';
            const danger = b.style === 'destructive';
            const main = !isCancel && (side ? i === 1 : i === 0);
            const bg = danger ? colors.danger : main ? colors.accent : 'transparent';
            return (
              <Pressable
                key={`${b.text}-${i}`}
                accessibilityRole="button"
                onPress={() => press(b)}
                style={({ pressed }) => ({ flex: side ? 1 : undefined, height: 46, paddingHorizontal: 16, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: bg === 'transparent' ? 1 : 0, borderColor: colors.border, opacity: pressed ? 0.8 : 1 })}>
                <Text size={15} weight={main || danger ? 'semi' : 'regular'} numberOfLines={1} style={{ color: danger ? (isDark ? '#2A0E0E' : '#FFFFFF') : main ? colors.onAccent : colors.text }}>{b.text ?? 'OK'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
  // Phones and tablets: a native overlay, so the dialog sits above sheets and modal screens too.
  if (Platform.OS !== 'web') {
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={cancel}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>{card}</KeyboardAvoidingView>
      </Modal>
    );
  }
  return <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>{card}</View>;
}
