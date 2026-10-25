import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View, type AlertButton } from 'react-native';
import { create } from 'zustand';

import { fonts, radii, useTheme } from '@/theme';

import { Text } from './Text';

type Item = { id: number; title: string; message?: string; buttons: AlertButton[]; prompt?: { value: string; onText?: (t: string) => void } };

const useAlerts = create<{ queue: Item[] }>(() => ({ queue: [] }));
let next = 1;

/** Queue an alert (the desktop app's stand-in for the system alert, which a web page doesn't have). */
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
  const { colors, body } = useTheme();
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
    // Capture phase: text fields stop key events from bubbling up.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, press]);

  return (
    <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radii.dialog, padding: 20, gap: 12 }}>
        <Text size={17} weight="semi">{item.title}</Text>
        {item.message ? <Text color="text2" size={14} style={{ lineHeight: 20 }}>{item.message}</Text> : null}
        {item.prompt ? (
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            accessibilityLabel={item.title}
            style={{ height: 44, borderRadius: radii.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 12, fontSize: body, fontFamily: fonts.ui }}
          />
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          {item.buttons.map((b, i) => {
            const main = b.style !== 'cancel' && i === item.buttons.length - 1;
            const bg = b.style === 'destructive' ? colors.danger : main ? colors.accent : 'transparent';
            return (
              <Pressable
                key={`${b.text}-${i}`}
                accessibilityRole="button"
                onPress={() => press(b)}
                style={{ minHeight: 40, minWidth: 80, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: bg === 'transparent' ? 1 : 0, borderColor: colors.border }}>
                <Text size={14} weight="medium" style={{ color: b.style === 'destructive' || main ? colors.onAccent : colors.text }}>{b.text ?? 'OK'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
