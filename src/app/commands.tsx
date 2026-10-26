import { router } from 'expo-router';
import { Children, useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Screen, SectionTitle, Text } from '@/components';
import { BUILT_IN, useCommandList, type CommandGroup } from '@/lib/commands';
import { useCommands } from '@/store/commands';
import { useTheme } from '@/theme';

const ORDER: CommandGroup[] = ['Create', 'Model', 'This chat', 'Write with the model', 'Go to'];

/** A box of command rows, as the design draws them (filled, 16 px corners, hairlines between). */
function Box16({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <View key={i} style={i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.hairline } : undefined}>{r}</View>
      ))}
    </View>
  );
}

/** `/name <args>` in the code font, what it does underneath, and a Skill / MCP badge when it comes from one. */
function CommandRow({ name, args, sub, badge, onPress }: { name: string; args?: string; sub: string; badge?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 14 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text mono size={14} color="accent">
          {`/${name}`}
          {args ? <Text mono size={12} color="faint">{` ${args}`}</Text> : null}
        </Text>
        <Text size={12.5} color="muted" style={{ lineHeight: 17 }}>{sub}</Text>
      </View>
      {badge ? (
        <View style={{ height: 22, borderRadius: 11, paddingHorizontal: 8, justifyContent: 'center', backgroundColor: colors.surface2 }}>
          <Text size={11} color="muted">{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Everything you can type after a slash in the chat box, plus your own commands. */
export default function Commands() {
  const { colors } = useTheme();
  const custom = useCommands((s) => s.items);
  const dynamic = useCommandList();
  const skills = dynamic.filter((c) => c.kind === 'skill');
  const servers = dynamic.filter((c) => c.kind === 'mcp');
  const groups = useMemo(() => ORDER.map((g) => [g, BUILT_IN.filter((c) => c.group === g)] as const), []);
  const names = new Set(custom.map((c) => c.name));

  return (
    <Screen header={{ title: 'Commands', right: 'add', addLabel: 'New command', onAdd: () => router.push('/command-edit') }} gap={14}>
      <Text size={13} color="muted" style={{ lineHeight: 19, paddingHorizontal: 4 }}>Type / in the chat box to see these. Commands that need text insert themselves; the rest run right away. Start a message with // to send a real slash.</Text>
      <View>
        <SectionTitle space={4}>Your commands</SectionTitle>
        <Box16>
          {custom.length === 0 ? <CommandRow name="…" sub="None yet. A command is a saved prompt with a name. Tap + to make one." onPress={() => router.push('/command-edit')} /> : null}
          {custom.map((c) => (
            <CommandRow key={c.id} name={c.name} sub={c.description || c.template.replace(/\s+/g, ' ').slice(0, 80)} onPress={() => router.push({ pathname: '/command-edit', params: { id: c.id } })} />
          ))}
        </Box16>
      </View>
      {groups.map(([g, list]) => (
        <View key={g}>
          <SectionTitle space={4}>{g}</SectionTitle>
          <Box16>
            {list.map((c) => <CommandRow key={c.name} name={c.name} args={c.args} sub={c.summary + (names.has(c.name) ? ' (replaced by your command)' : '')} />)}
          </Box16>
        </View>
      ))}
      {skills.length > 0 && (
        <View>
          <SectionTitle space={4}>Your skills</SectionTitle>
          <Box16>
            {skills.map((c) => <CommandRow key={c.name} name={c.name} args="<what to do>" sub={c.summary} badge="Skill" onPress={() => router.push({ pathname: '/skill-detail', params: { id: c.ref! } })} />)}
          </Box16>
        </View>
      )}
      {servers.length > 0 && (
        <View>
          <SectionTitle space={4}>Your MCP servers</SectionTitle>
          <Box16>
            {servers.map((c) => <CommandRow key={c.name} name={c.name} args="[what to do | off]" sub={c.summary} badge="MCP" onPress={() => router.push({ pathname: '/mcp-detail', params: { id: c.ref! } })} />)}
          </Box16>
        </View>
      )}
      <Pressable accessibilityRole="button" onPress={() => router.push('/market')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: colors.surface }}>
        <Icon name="store" size={20} color={colors.text} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text size={15} weight="medium">Get more from the marketplace</Text>
          <Text size={12.5} color="muted">Every skill and MCP server you add becomes a command.</Text>
        </View>
        <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
      </Pressable>
    </Screen>
  );
}
