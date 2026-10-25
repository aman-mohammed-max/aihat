import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Card, ListRow, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { useDraft } from '@/store/draft';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';

export default function ToolsSheet() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const { skills, servers } = useLibrary();
  const draft = useDraft();
  const settings = useSettings();
  const toolIds = chat?.toolIds ?? servers.filter((s) => s.enabledByDefault).map((s) => s.id);

  const toggleServer = (id: string, on: boolean) => {
    const next = on ? [...toolIds, id] : toolIds.filter((x) => x !== id);
    if (chatId) useChats.getState().patch(chatId, { toolIds: next });
  };

  const sectionHeader = ({ title, manage }: { title: string; manage: string }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text size={13} weight="medium" color="muted">{title}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace(manage as never)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text size={13} color="accent">Manage</Text>
      </Pressable>
    </View>
  );

  return (
    <RouteSheet title="Tools for this chat">
      <Card>
        <ListRow label="Web search" toggle={{ on: draft.searchOn, onChange: (searchOn) => draft.set({ searchOn }) }} />
        <ListRow label="Image generation" toggle={{ on: draft.imageOn, onChange: (imageOn) => draft.set({ imageOn }) }} />
        <ListRow label="Generative UI" toggle={{ on: settings.genUi, onChange: (genUi) => settings.set({ genUi }) }} last />
      </Card>

      {sectionHeader({ title: "Skills", manage: "/skills" })}
      <Card>
        {skills.length === 0 && <ListRow label="No skills yet" last />}
        {skills.map((s, i) => (
          <ListRow key={s.id} label={s.name} toggle={{ on: s.enabled, onChange: (enabled) => useLibrary.getState().saveSkill({ ...s, enabled }) }} last={i === skills.length - 1} />
        ))}
      </Card>

      {sectionHeader({ title: "MCP servers & connectors", manage: "/mcp" })}
      <Card>
        {servers.length === 0 && <ListRow label="No servers yet" last />}
        {servers.map((s, i) =>
          s.connected ? (
            <ListRow key={s.id} label={s.name} sub={`${s.isConnector ? 'Connector · ' : ''}${s.tools.length} tools`} toggle={{ on: toolIds.includes(s.id), onChange: (on) => toggleServer(s.id, on) }} last={i === servers.length - 1} />
          ) : (
            <ListRow key={s.id} label={s.name} sub="Sign-in needed" value="Connect" onPress={() => router.replace({ pathname: '/mcp-detail', params: { id: s.id } })} last={i === servers.length - 1} />
          ),
        )}
      </Card>
    </RouteSheet>
  );
}
