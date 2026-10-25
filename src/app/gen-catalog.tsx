import { View } from 'react-native';

import { Card, ListRow, Screen, SectionTitle, Text } from '@/components';
import { ACTION_POLICY, catalog } from '@/genui/catalog';

export default function GenCatalog() {
  const data = catalog.data as { components: Record<string, { description?: string }>; actions: Record<string, { description?: string }> };
  const comps = Object.entries(data.components);
  const custom = comps.filter(([k]) => k === 'CodeBlock');
  const standard = comps.filter(([k]) => k !== 'CodeBlock');
  const actions = Object.entries(data.actions);
  return (
    <Screen header={{ title: 'Components & actions' }}>
      <Text size={13} color="muted">The only components and actions the AI may use. Anything else in a reply is rejected.</Text>
      <View>
        <SectionTitle>{`Standard · ${standard.length}`}</SectionTitle>
        <Card style={{ padding: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {standard.map(([k]) => <Text key={k} size={13} color="text2">{k}</Text>)}
        </Card>
      </View>
      <View>
        <SectionTitle>{`Your components · ${custom.length}`}</SectionTitle>
        <Card>{custom.map(([k, v], i) => <ListRow key={k} label={k} sub={v.description} last={i === custom.length - 1} />)}</Card>
      </View>
      <View>
        <SectionTitle>{`Actions · ${actions.length}`}</SectionTitle>
        <Card>{actions.map(([k], i) => <ListRow key={k} mono label={k} value={ACTION_POLICY[k] ?? 'Auto'} last={i === actions.length - 1} />)}</Card>
      </View>
    </Screen>
  );
}
