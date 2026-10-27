import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ListRow, Text, Toggle } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { useDraft } from '@/store/draft';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';

/** A skill or server in the sheet: its name in the code font (and a line under it), and a switch or a Connect link. */
function ToolRow({ name, sub, warn, toggle, onConnect }: { name: string; sub?: string; warn?: boolean; toggle?: { on: boolean; onChange: (v: boolean) => void }; onConnect?: () => void }) {
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text mono size={14} numberOfLines={1}>{name}</Text>
        {sub ? <Text size={12} color={warn ? 'warn' : 'muted'}>{sub}</Text> : null}
      </View>
      {toggle ? <Toggle on={toggle.on} onChange={toggle.onChange} label={name} /> : <Text size={13} color="accent">Connect</Text>}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, minHeight: 48, paddingHorizontal: 4, paddingVertical: 4 };
  return onConnect ? <Pressable accessibilityRole="button" accessibilityLabel={`${name}. ${sub ?? ''} Connect`} onPress={onConnect} style={style}>{body}</Pressable> : <View style={style}>{body}</View>;
}

function Heading({ title, manage }: { title: string; manage: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
      <Text size={12} weight="medium" color="muted">{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${title}`} hitSlop={8} onPress={() => router.replace(manage as never)} style={{ paddingVertical: 6 }}>
        <Text size={13} color="muted">Manage</Text>
      </Pressable>
    </View>
  );
}

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
    else {
      const s = servers.find((x) => x.id === id);
      if (s) useLibrary.getState().saveServer({ ...s, enabledByDefault: on });
    }
  };

  return (
    <RouteSheet title="Tools for this chat">
      <View>
        <ListRow label="Web search" toggle={{ on: draft.searchOn, onChange: (searchOn) => draft.set({ searchOn }) }} />
        <ListRow label="Image generation" toggle={{ on: draft.imageOn, onChange: (imageOn) => draft.set({ imageOn }) }} />
        <ListRow label="Generative UI" toggle={{ on: settings.genUi, onChange: (genUi) => settings.set({ genUi }) }} />
        {chatId ? (chat && !chat.temporary ? (
          <ListRow
            label="Memory in this chat"
            height={48}
            toggle={{ on: chat.memoryEnabled, onChange: (memoryEnabled) => { void useChats.getState().patch(chat.id, { memoryEnabled }); } }}
          />
        ) : null) : !settings.tempByDefault ? (
          <ListRow
            label="Memory in this chat"
            height={48}
            toggle={{ on: draft.memoryOn, onChange: (memoryOn) => draft.set({ memoryOn }) }}
          />
        ) : null}
      </View>
      <View>
        <Heading title="Skills" manage="/skills" />
        {skills.length === 0 && <Text size={13.5} color="muted" style={{ paddingHorizontal: 4, paddingVertical: 12 }}>No skills yet.</Text>}
        {skills.map((s) => (
          <ToolRow key={s.id} name={s.name} toggle={{ on: s.enabled, onChange: (enabled) => useLibrary.getState().saveSkill({ ...s, enabled }) }} />
        ))}
      </View>
      <View>
        <Heading title="MCP servers & connectors" manage="/mcp" />
        {servers.length === 0 && <Text size={13.5} color="muted" style={{ paddingHorizontal: 4, paddingVertical: 12 }}>No servers yet.</Text>}
        {servers.map((s) =>
          s.connected ? (
            <ToolRow key={s.id} name={s.name} sub={`${s.isConnector ? 'Connector · ' : ''}${s.tools.length} tools`} toggle={{ on: toolIds.includes(s.id), onChange: (on) => toggleServer(s.id, on) }} />
          ) : (
            <ToolRow key={s.id} name={s.name} sub={s.auth === 'none' ? 'Not connected' : 'Sign-in needed'} warn onConnect={() => router.replace({ pathname: '/mcp-detail', params: { id: s.id } })} />
          ),
        )}
      </View>
    </RouteSheet>
  );
}
