import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Button, Card, ListRow, Screen, SectionTitle, Text } from '@/components';
import { BUILT_IN, type Command, type CommandGroup } from '@/lib/commands';
import { useCommands } from '@/store/commands';

const ORDER: CommandGroup[] = ['Create', 'Model', 'This chat', 'Write with the model', 'Go to'];

/** Everything you can type after a slash in the chat box, plus your own commands. */
export default function Commands() {
  const custom = useCommands((s) => s.items);
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
    </Screen>
  );
}
