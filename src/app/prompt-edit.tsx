import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Button, Field, ListRow, Screen, Text } from '@/components';
import { pick } from '@/lib/pick';
import { useChats } from '@/store/chats';
import { useLibrary } from '@/store/library';
import { isChatModel, useProviders } from '@/store/providers';
import { fonts, radii, useTheme } from '@/theme';

const ANY = '__any__';

export default function PromptEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const existing = useLibrary((s) => s.prompts.find((p) => p.id === id));
  const servers = useLibrary((s) => s.servers);
  const models = useProviders((s) => s.models);
  const [name, setName] = useState(existing?.name ?? '');
  const [text, setText] = useState(existing?.body ?? '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [editTags, setEditTags] = useState(false);
  const [fav, setFav] = useState(existing?.favorite ?? false);
  const [model, setModel] = useState<string | null>(existing?.preferredModelId ?? null);
  const [toolIds, setToolIds] = useState(existing?.toolIds ?? []);
  const [focused, setFocused] = useState(false);

  const save = async () =>
    useLibrary.getState().savePrompt({
      id, name: name.trim() || 'Untitled', body: text, favorite: fav, toolIds,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      variables: existing?.variables ?? [], preferredModelId: model,
    });
  const [variable, setVariable] = useState<string | null>(null);
  const insert = (v: string) => setText((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}{${v}}`);
  const addVariable = () => {
    const v = (variable ?? '').trim().replace(/[{}\s]+/g, '_');
    if (v) insert(v);
    setVariable(null);
  };
  const chooseTools = () =>
    pick('Turn on with this prompt', [{ value: '', label: 'None' }, ...servers.map((v) => ({ value: v.id, label: v.name, note: toolIds.includes(v.id) ? 'On' : undefined }))], '', (v) => setToolIds(v === '' ? [] : toolIds.includes(v) ? toolIds.filter((x) => x !== v) : [...toolIds, v]));

  return (
    <Screen
      header={{ left: 'cancel', right: 'text', rightText: 'Save', title: id ? 'Edit prompt' : 'New prompt', onRightText: async () => { await save(); router.back(); } }}
      footer={
        <>
          <Button label="Start a chat" flex onPress={async () => { const pid = await save(); const cid = await useChats.getState().create({ promptId: pid }); router.dismissTo(`/chat/${cid}` as never); }} />
          {id ? <Button label="Delete" variant="danger" flex onPress={async () => { await useLibrary.getState().deletePrompt(id); router.back(); }} /> : null}
        </>
      }
      gap={16}>
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="sentences" />
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Text size={12} weight="medium" color="muted">Prompt</Text>
          <Text mono size={11.5} color="muted">{`~${Math.ceil(text.length / 4)} tokens`}</Text>
        </View>
        <TextInput
          accessibilityLabel="Prompt"
          value={text}
          onChangeText={setText}
          selectionColor={colors.accent}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          textAlignVertical="top"
          placeholderTextColor={colors.faint}
          placeholder="You are…"
          style={{ minHeight: 200, borderRadius: radii.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: focused ? colors.accent : colors.field, padding: 12, color: colors.text, fontFamily: fonts.ui, fontSize: 14, lineHeight: 21.7 }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
          <Text size={12} color="muted" style={{ paddingRight: 2 }}>Insert</Text>
          {['date', 'language', 'model'].map((v) => (
            <Pressable key={v} accessibilityRole="button" onPress={() => insert(v)} style={{ height: 30, borderRadius: 8, backgroundColor: colors.surface2, paddingHorizontal: 8, justifyContent: 'center' }}>
              <Text mono size={12}>{`{${v}}`}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setVariable(variable == null ? '' : null)} style={{ height: 30, borderRadius: 8, backgroundColor: colors.surface2, paddingHorizontal: 8, justifyContent: 'center' }}>
            <Text mono size={12}>+ custom</Text>
          </Pressable>
        </View>
        {variable != null && (
          <Field
            label="Variable name"
            value={variable}
            onChangeText={setVariable}
            mono
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={addVariable}
            placeholder="audience"
            hint="Becomes {audience} in the prompt. Press return to add it."
          />
        )}
      </View>
      <View>
        <ListRow label="Tags" value={tags.trim() || 'None'} onPress={() => setEditTags(!editTags)} />
        {editTags && <Field label="Tags (comma separated)" value={tags} onChangeText={setTags} />}
        <ListRow
          label="Preferred model"
          value={model ?? 'Any'}
          monoValue={!!model}
          onPress={() => pick('Preferred model', [{ value: ANY, label: 'Any' }, ...models.filter((m) => m.enabled && isChatModel(m)).map((m) => m.id)], model ?? ANY, (v) => setModel(v === ANY ? null : v))}
        />
        <ListRow label="Turn on with this prompt" value={toolIds.length ? servers.filter((v) => toolIds.includes(v.id)).map((v) => v.name).join(', ') : 'None'} sub={servers.length ? undefined : 'Add MCP servers first'} onPress={servers.length ? chooseTools : undefined} />
        <ListRow label="Favorite" toggle={{ on: fav, onChange: setFav }} />
      </View>
    </Screen>
  );
}
