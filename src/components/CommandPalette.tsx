import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { matchCommands, splitCommand, findCommand, useCommandList, type Command } from '@/lib/commands';
import * as haptic from '@/lib/haptics';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type Props = {
  text: string;
  /** Put text in the chat box (used to complete "/ima" into "/image "). */
  onInsert: (text: string) => void;
  /** Run a command that needs no extra text straight away. */
  onRun: (text: string) => void;
};

/**
 * Appears above the chat box while a slash command is being typed: a filtered list of commands,
 * then (once the name is complete) a one-line hint with the command's current settings.
 */
export function CommandPalette({ text, onInsert, onRun }: Props) {
  const { colors } = useTheme();
  const list = useCommandList();
  const typing = /^\/([a-z0-9_-]*)$/i.exec(text);
  const matches = useMemo(() => (typing ? matchCommands(typing[1], list) : []), [typing, list]);

  // Name complete and followed by a space: show what the command will do.
  const parsed = !typing ? splitCommand(text) : null;
  const active: Command | undefined = parsed && /\s/.test(text) ? findCommand(parsed.name, list) : undefined;

  if (active) {
    const hint = active.hint?.();
    if (!hint && !active.args) return null;
    return (
      <View style={{ marginHorizontal: 12, marginBottom: 6, borderRadius: 14, backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 4, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text size={12.5} color="muted" style={{ flex: 1 }} numberOfLines={2}>
          <Text size={12.5} mono color="accent">/{active.name}</Text> {hint ?? active.summary}
        </Text>
        {active.options ? (
          <Pressable accessibilityRole="button" onPress={() => { haptic.select(); active.options!(); }} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}>
            <Text size={13} color="accent" weight="medium">Options</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!typing || matches.length === 0) return null;
  return (
    <View style={{ marginHorizontal: 12, marginBottom: 6, borderRadius: 16, backgroundColor: colors.surface, maxHeight: 300, overflow: 'hidden' }}>
      <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingVertical: 4 }}>
        {matches.slice(0, 40).map((c) => (
          <Pressable
            key={c.name}
            accessibilityRole="button"
            accessibilityLabel={`/${c.name}. ${c.summary}`}
            onPress={() => {
              haptic.select();
              if (c.needsArgs) onInsert(`/${c.name} `);
              else onRun(`/${c.name}`);
            }}
            style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? colors.surface2 : 'transparent' })}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text mono size={14} numberOfLines={1}>
                <Text mono size={14} color="accent">/{c.name}</Text>
                {c.args ? <Text mono size={12} color="faint">  {c.args}</Text> : null}
              </Text>
              <Text size={12.5} color="muted" numberOfLines={2}>{c.summary}</Text>
            </View>
            {c.custom ? <Icon name="edit" size={13} color={colors.faint} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
