import { useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { Button, Dialog, ListRow, Screen, SectionTitle, Text } from '@/components';
import { MAX_MEMORIES, MAX_MEMORY_LENGTH, MAX_MEMORY_TITLE_LENGTH } from '@/lib/memory';
import { pick } from '@/lib/pick';
import { uid } from '@/lib/id';
import { isChatModel, useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';
import { fonts, useTheme } from '@/theme';

const inputStyle = {
  minHeight: 44,
  borderRadius: 11,
  borderWidth: 1,
  paddingHorizontal: 11,
  paddingVertical: 9,
  fontSize: 14,
  lineHeight: 19,
  fontFamily: fonts.ui,
};

export default function Memory() {
  const s = useSettings();
  const { colors } = useTheme();
  const allModels = useProviders((state) => state.models);
  const models = useMemo(() => allModels.filter((model) => model.enabled && isChatModel(model)), [allModels]);
  const providers = useProviders((state) => state.providers);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [textDraft, setTextDraft] = useState('');

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setTitleDraft('');
    setTextDraft('');
  };

  const saveMemory = () => {
    const title = titleDraft.trim().slice(0, MAX_MEMORY_TITLE_LENGTH);
    const text = textDraft.trim().slice(0, MAX_MEMORY_LENGTH);
    if (!title || !text) return;
    if (editingId) {
      s.set({ memoryItems: s.memoryItems.map((item) => item.id === editingId ? { ...item, title, text } : item) });
      toast('Memory updated');
    } else {
      if (s.memoryItems.length >= MAX_MEMORIES) return;
      s.set({ memoryItems: [{ id: uid(), title, text, createdAt: Date.now() }, ...s.memoryItems] });
      toast('Memory saved');
    }
    resetForm();
  };

  const startEdit = (id: string) => {
    const item = s.memoryItems.find((memory) => memory.id === id);
    if (!item) return;
    setEditingId(id);
    setTitleDraft(item.title);
    setTextDraft(item.text);
    setFormOpen(true);
  };

  const startAdd = () => {
    setEditingId(null);
    setTitleDraft('');
    setTextDraft('');
    setFormOpen(true);
  };

  const clearAll = () => Alert.alert('Clear memories?', 'Your chats will stay as they are.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear all', style: 'destructive', onPress: () => { s.set({ memoryItems: [] }); toast('Memories cleared'); } },
  ]);

  const chooseFallbackModel = () => {
    const selected = s.memoryFallbackRoute.model
      ? JSON.stringify({ providerId: s.memoryFallbackRoute.providerId, modelId: s.memoryFallbackRoute.model })
      : '';
    const options = [
      { value: '', label: 'Use the chat model' },
      ...models.map((model) => ({
        value: JSON.stringify({ providerId: model.providerId, modelId: model.id }),
        label: `${model.name} · ${providers.find((provider) => provider.id === model.providerId)?.name ?? 'Provider'}`,
      })),
    ];
    pick('Auto-save model', options, selected, (value) => {
      if (!value) return s.set({ memoryFallbackRoute: { providerId: null, model: '' } });
      try {
        const route = JSON.parse(value) as { providerId: string; modelId: string };
        s.set({ memoryFallbackRoute: { providerId: route.providerId, model: route.modelId } });
      } catch {
        s.set({ memoryFallbackRoute: { providerId: null, model: '' } });
      }
    });
  };

  const selectedFallback = models.find((model) => model.providerId === s.memoryFallbackRoute.providerId && model.id === s.memoryFallbackRoute.model);
  const selectedProvider = providers.find((provider) => provider.id === s.memoryFallbackRoute.providerId);

  return (
    <Screen header={{ title: 'Memory' }} gap={12}>
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 12 }}>
        <ListRow
          label="Use memory in chats"
          height={48}
          toggle={{ on: s.memoryEnabled, onChange: (memoryEnabled) => s.set({ memoryEnabled }) }}
        />
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 12 }}>
        <ListRow
          label="Auto-save for other models"
          sub="Off by default; uses one extra request."
          height={52}
          toggle={{ on: s.memoryFallbackEnabled, onChange: (memoryFallbackEnabled) => s.set({ memoryFallbackEnabled }) }}
        />
        {s.memoryFallbackEnabled ? (
          <ListRow
            label="Auto-save model"
            value={selectedFallback ? `${selectedFallback.name} · ${selectedProvider?.name ?? ''}` : 'Use the chat model'}
            monoValue={!!selectedFallback}
            height={44}
            onPress={chooseFallbackModel}
          />
        ) : null}
      </View>

      <View style={{ width: '100%', marginTop: 12 }}>
        <Button label="Add memory" height={40} disabled={s.memoryItems.length >= MAX_MEMORIES} onPress={startAdd} />
      </View>

      <Dialog
        visible={formOpen}
        onClose={resetForm}
        title={editingId ? 'Edit memory' : 'Add memory'}
        confirmLabel={editingId ? 'Save' : 'Add memory'}
        confirmDisabled={!titleDraft.trim() || !textDraft.trim() || (!editingId && s.memoryItems.length >= MAX_MEMORIES)}
        onConfirm={saveMemory}>
        <TextInput
          accessibilityLabel="Memory title"
          value={titleDraft}
          onChangeText={setTitleDraft}
          placeholder="Title"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          maxLength={MAX_MEMORY_TITLE_LENGTH}
          style={[inputStyle, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.field }]}
        />
        <TextInput
          accessibilityLabel="Memory details"
          value={textDraft}
          onChangeText={setTextDraft}
          placeholder="What should AI Hat remember?"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          multiline
          maxLength={MAX_MEMORY_LENGTH}
          textAlignVertical="top"
          style={[inputStyle, { minHeight: 68, color: colors.text, backgroundColor: colors.bg, borderColor: colors.field }]}
        />
      </Dialog>

      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 4 }}>
          <SectionTitle space={0}>{`Saved memories · ${s.memoryItems.length}/${MAX_MEMORIES}`}</SectionTitle>
          {s.memoryItems.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear all memories" onPress={clearAll} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text size={12.5} color="danger">Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        {s.memoryItems.length ? (
          <View style={{ gap: 7 }}>
            {s.memoryItems.map((item) => (
              <View key={item.id} style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text size={13.5} weight="medium" style={{ flex: 1 }}>{item.title}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`} onPress={() => startEdit(item.id)} style={{ minWidth: 40, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
                    <Text size={12} color="accent">Edit</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} onPress={() => { s.set({ memoryItems: s.memoryItems.filter((memory) => memory.id !== item.id) }); toast('Memory deleted'); }} style={{ minWidth: 48, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
                    <Text size={12} color="danger">Delete</Text>
                  </Pressable>
                </View>
                <Text size={13} color="text2" style={{ lineHeight: 18 }}>{item.text}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text size={13} color="muted" style={{ paddingHorizontal: 4, paddingVertical: 6 }}>No memories yet.</Text>
        )}
      </View>

    </Screen>
  );
}
