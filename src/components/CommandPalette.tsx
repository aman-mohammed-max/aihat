import { useMemo, useState } from 'react';
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
  return <PaletteList matches={matches} onInsert={onInsert} onRun={onRun} />;
}

type Tab = 'all' | 'commands' | 'skills' | 'mcp';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'commands', label: 'Commands' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
];
const inTab = (c: Command, t: Tab) => t === 'all' || (t === 'skills' ? c.kind === 'skill' : t === 'mcp' ? c.kind === 'mcp' : !c.kind);

/** The list itself. It exists only while a command is being typed, so its filter resets each time. */
function PaletteList({ matches, onInsert, onRun }: { matches: Command[]; onInsert: (text: string) => void; onRun: (text: string) => void }) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('all');
  const count = (t: Tab) => matches.filter((c) => inTab(c, t)).length;
  // Filter chips only appear once there is a skill or MCP server to filter for.
  const showTabs = count('skills') + count('mcp') > 0;
  const shown = matches.filter((c) => inTab(c, showTabs ? tab : 'all'));

  return (
    <View style={{ marginHorizontal: 12, marginBottom: 6, borderRadius: 16, backgroundColor: colors.surface, maxHeight: 320, overflow: 'hidden' }}>
      {showTabs && (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2 }}>
          {TABS.filter((t) => t.id === 'all' || count(t.id) > 0).map((t) => {
            const on = tab === t.id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => { haptic.select(); setTab(t.id); }}
                hitSlop={{ top: 6, bottom: 6 }}
                style={{ height: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: on ? colors.accentSoft : colors.surface2 }}>
                <Text size={12.5} weight={on ? 'medium' : 'regular'} color={on ? 'accent' : 'muted'}>{t.label} {count(t.id)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingVertical: 4 }}>
        {shown.length === 0 && <Text size={13} color="muted" style={{ padding: 14 }}>Nothing here matches.</Text>}
        {shown.slice(0, 60).map((c) => (
          <Pressable
            key={c.name}
            accessibilityRole="button"
            accessibilityLabel={`/${c.name}${c.kind ? `, ${c.kind === 'mcp' ? 'MCP server' : 'skill'}` : ''}. ${c.summary}`}
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
            {c.kind ? (
              <View style={{ height: 22, borderRadius: 11, paddingHorizontal: 8, justifyContent: 'center', backgroundColor: colors.surface2 }}>
                <Text size={11} color="muted">{c.kind === 'mcp' ? 'MCP' : 'Skill'}</Text>
              </View>
            ) : null}
            {c.custom ? <Icon name="edit" size={13} color={colors.faint} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
