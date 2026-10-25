import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, Field, ListRow, Screen, SectionTitle, Segmented, Text } from '@/components';
import { BUILT_IN } from '@/lib/commands';
import * as haptic from '@/lib/haptics';
import { COMMAND_NAME, useCommands, type CustomCommand } from '@/store/commands';
import { fonts, radii, useTheme } from '@/theme';

/** Write a command: a name plus a prompt, where {input} is the text typed after the command. */
export default function CommandEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, body } = useTheme();
  const existing = useCommands((s) => s.items.find((c) => c.id === id));
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [template, setTemplate] = useState(existing?.template ?? '');
  const [mode, setMode] = useState<CustomCommand['mode']>(existing?.mode ?? 'send');
  const [error, setError] = useState('');
  const clean = name.trim().replace(/^\//, '').toLowerCase();
  const replaces = BUILT_IN.some((c) => c.name === clean || c.aliases?.includes(clean));

  const save = async () => {
    const r = await useCommands.getState().save({ id, name, description, template, mode });
    if (!r.ok) {
      haptic.error();
      return setError(r.error ?? 'Could not save.');
    }
    haptic.success();
    router.back();
  };

  return (
    <Screen
      header={{ left: 'cancel', right: 'text', rightText: 'Save', title: id ? 'Edit command' : 'New command', onRightText: save }}
      footer={id ? <Button label="Delete command" variant="danger" flex onPress={async () => { await useCommands.getState().remove(id); router.back(); }} /> : undefined}>
      <View style={{ gap: 6 }}>
        <Field label="Name" value={name} onChangeText={(t) => { setName(t); setError(''); }} placeholder="standup" hint={clean && COMMAND_NAME.test(clean) ? `You'll type /${clean}` : 'Letters, numbers, - or _'} />
        {replaces ? <Text size={12.5} color="warn">This replaces the built-in /{clean}.</Text> : null}
      </View>
      <Field label="Description (optional)" value={description} onChangeText={setDescription} autoCapitalize="sentences" placeholder="Turn my notes into a standup update" />
      <View style={{ gap: 6 }}>
        <Text size={12.5} weight="medium" color="muted">What it sends</Text>
        <TextInput
          accessibilityLabel="What it sends"
          value={template}
          onChangeText={(t) => { setTemplate(t); setError(''); }}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
          placeholder={'Turn these notes into a short standup update (yesterday, today, blockers):\n\n{input}'}
          placeholderTextColor={colors.faint}
          style={{ minHeight: 160, borderRadius: radii.input, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.text, fontFamily: fonts.ui, fontSize: body }}
        />
        <Text size={12} color="muted">{'{input}'} is the text you type after the command. Also available: {'{date}'} and {'{model}'}. With no {'{input}'}, text you type is added after the prompt.</Text>
      </View>
      <View style={{ gap: 8 }}>
        <SectionTitle>When you use it</SectionTitle>
        <Segmented<CustomCommand['mode']> options={[{ value: 'send', label: 'Send it' }, { value: 'insert', label: 'Put it in the box' }]} value={mode} onChange={setMode} />
        <Text size={12} color="muted">“Put it in the box” fills the chat box so you can edit before sending.</Text>
      </View>
      {error ? <Card><ListRow icon="warn" danger label={error} last /></Card> : null}
    </Screen>
  );
}
