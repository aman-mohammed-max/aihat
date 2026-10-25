import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Button, Card, ListRow, Screen, SectionTitle, Text } from '@/components';
import { BUILT_IN, useCommandList, type Command, type CommandGroup } from '@/lib/commands';
import { useCommands } from '@/store/commands';

const ORDER: CommandGroup[] = ['Create', 'Model', 'This chat', 'Write with the model', 'Go to'];

/** Everything you can type after a slash in the chat box, plus your own commands. */
export default function Commands() {
  const custom = useCommands((s) => s.items);
  const dynamic = useCommandList();
  const skills = dynamic.filter((c) => c.kind === 'skill');
  const servers = dynamic.filter((c) => c.kind === 'mcp');
  const groups = useMemo(() => ORDER.map((g) => [g, BUILT_IN.filter((c) => c.group === g)] as const), []);
  const names = new Set(custom.map((c) => c.name));

  const row = (c: Command, last: boolean) => (
    <ListRow key={c.name} mono label={`/${c.name}${c.args ? ' ' + c.args.split(' ')[0] : ''}`} sub={c.summary + (names.has(c.name) ? ' (replaced by your command)' : '')} last={last} />
  );

  return (
    <Screen header={{ title: 'Commands', right: 'add', addLabel: 'New command', onAdd: () => router.push('/command-edit') }} footer={<Button label="New command" flex onPress={() => router.push('/command-edit')} />}>
      <Text size={13} color="muted">Type / in the chat box to see these. Commands that need text insert themselves; the rest run right away. Start a message with // to send a real slash.</Text>
      <View>
        <SectionTitle>Your commands</SectionTitle>
        <Card>
          {custom.length === 0 ? <ListRow label="None yet" sub="A command is a saved prompt with a name. Tap + to make one." last /> : null}
          {custom.map((c, i) => (
            <ListRow key={c.id} mono label={`/${c.name}`} sub={c.description || c.template.replace(/\s+/g, ' ').slice(0, 80)} onPress={() => router.push({ pathname: '/command-edit', params: { id: c.id } })} last={i === custom.length - 1} />
          ))}
        </Card>
      </View>
      {groups.map(([g, list]) => (
        <View key={g}>
          <SectionTitle>{g}</SectionTitle>
          <Card>{list.map((c, i) => row(c, i === list.length - 1))}</Card>
        </View>
      ))}
      {skills.length > 0 && (
        <View>
          <SectionTitle>Your skills</SectionTitle>
          <Card>
            {skills.map((c, i) => <ListRow key={c.name} mono label={`/${c.name} <what to do>`} sub={c.summary} onPress={() => router.push({ pathname: '/skill-detail', params: { id: c.ref! } })} last={i === skills.length - 1} />)}
          </Card>
        </View>
      )}
      {servers.length > 0 && (
        <View>
          <SectionTitle>Your MCP servers</SectionTitle>
          <Card>
            {servers.map((c, i) => <ListRow key={c.name} mono label={`/${c.name} [what to do]`} sub={c.summary} onPress={() => router.push({ pathname: '/mcp-detail', params: { id: c.ref! } })} last={i === servers.length - 1} />)}
          </Card>
        </View>
      )}
      <Card><ListRow icon="store" label="Get more from the marketplace" sub="Every skill and MCP server you add becomes a command." onPress={() => router.push('/market')} last /></Card>
    </Screen>
  );
}
