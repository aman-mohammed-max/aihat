import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, Chip, ListRow, Screen, Text, Field } from '@/components';
import { useChats } from '@/store/chats';
import { useLibrary } from '@/store/library';
import { fonts, radii, useTheme } from '@/theme';


export default function PromptEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, body } = useTheme();
  const existing = useLibrary((s) => s.prompts.find((p) => p.id === id));
  const servers = useLibrary((s) => s.servers);
  const [name, setName] = useState(existing?.name ?? '');
  const [text, setText] = useState(existing?.body ?? '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [fav, setFav] = useState(existing?.favorite ?? false);
  const [toolIds] = useState(existing?.toolIds ?? []);

  const save = async () => {
    const saved = await useLibrary.getState().savePrompt({
      id, name: name.trim() || 'Untitled', body: text, favorite: fav, toolIds,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      variables: existing?.variables ?? [], preferredModelId: existing?.preferredModelId ?? null,
    });
    return saved;
  };
  const insert = (v: string) => setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}{${v}}`);

  return (
    <Screen
      header={{ left: 'cancel', right: 'text', rightText: 'Save', title: id ? 'Edit prompt' : 'New prompt', onRightText: async () => { await save(); router.back(); } }}
      footer={<>
        <Button label="Start a chat" flex onPress={async () => { const pid = await save(); const cid = await useChats.getState().create({ promptId: pid }); router.dismissTo(`/chat/${cid}` as never); }} />
        {id ? <Button label="Delete" variant="danger" onPress={async () => { await useLibrary.getState().deletePrompt(id); router.back(); }} /> : null}
      </>}>
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="sentences" />
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text size={12.5} weight="medium" color="muted">Prompt</Text>
          <Text size={12} color="muted">~{Math.ceil(text.length / 4)} tokens</Text>
        </View>
        <TextInput accessibilityLabel="Prompt" value={text} onChangeText={setText} multiline textAlignVertical="top" placeholderTextColor={colors.faint} placeholder="You are…" style={{ minHeight: 200, borderRadius: radii.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.text, fontFamily: fonts.mono, fontSize: body - 1.5 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text size={12} color="muted">Insert</Text>
          {['date', 'language', 'model'].map((v) => <Chip key={v} label={`{${v}}`} onPress={() => insert(v)} />)}
        </View>
      </View>
      <Field label="Tags (comma separated)" value={tags} onChangeText={setTags} />
      <Card>
        <ListRow label="Turn on with this prompt" value={toolIds.length ? `${toolIds.length} tools` : 'None'} sub={servers.length ? undefined : 'Add MCP servers first'} />
        <ListRow label="Favorite" toggle={{ on: fav, onChange: setFav }} last />
      </Card>
    </Screen>
  );
}
