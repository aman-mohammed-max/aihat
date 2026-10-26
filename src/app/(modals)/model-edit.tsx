import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Chip, Field, Note, SectionTitle, Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import * as haptic from '@/lib/haptics';
import { KIND_LABEL, SUGGESTED_MODELS, type ModelKind } from '@/lib/models';
import { useProviders } from '@/store/providers';
import { useSettings, type Capability } from '@/store/settings';

const KINDS: ModelKind[] = ['chat', 'image', 'speech', 'transcription', 'embedding', 'video'];
const CAP_OF: Partial<Record<ModelKind, Capability>> = { image: 'images', speech: 'speech', transcription: 'transcription', embedding: 'embeddings' };

/**
 * Add, edit or delete a model by hand. Servers that don't list their image / speech models
 * (for example a gateway's /models) can still be used by typing the model id.
 */
export default function ModelEdit() {
  const { providerId, id, kind: kindParam, select } = useLocalSearchParams<{ providerId: string; id?: string; kind?: ModelKind; select?: string }>();
  const provider = useProviders((s) => s.providers.find((p) => p.id === providerId));
  const existing = useProviders((s) => s.models.find((m) => m.providerId === providerId && m.id === id));
  const [modelId, setModelId] = useState(existing?.id ?? '');
  const [name, setName] = useState(existing && existing.name !== existing.id ? existing.name : '');
  const [kind, setKind] = useState<ModelKind>(existing?.caps.kind ?? kindParam ?? 'chat');
  const [error, setError] = useState('');
  const editing = !!existing;
  const custom = !!existing?.caps.custom;
  if (!provider) return null;

  const save = async () => {
    const store = useProviders.getState();
    if (editing) {
      await store.updateModel(providerId, existing!.id, { name, kind });
    } else {
      const r = await store.addModel(providerId, { id: modelId, name, kind });
      if (!r.ok) {
        haptic.error();
        return setError(r.error ?? 'Could not add the model.');
      }
      // Opened from a feature's model picker: use the new model straight away.
      const cap = select as Capability | undefined;
      if (cap) {
        const st = useSettings.getState();
        st.set({ routes: { ...st.routes, [cap]: { providerId, model: modelId.trim() } } });
      }
    }
    haptic.success();
    router.back();
  };

  return (
    <RouteSheet title={editing ? 'Edit model' : 'Add a model'}>
      <Text size={13} color="muted" style={{ lineHeight: 19, paddingHorizontal: 4 }}>
        {editing ? `${provider.name}${custom ? ' · added by you' : ' · listed by the provider'}` : `For ${provider.name}. Use this when the endpoint doesn’t list the model you need, for example a gateway that only lists its chat models.`}
      </Text>
      <Field label="Model id" value={modelId} onChangeText={(t) => { setModelId(t); setError(''); }} editable={!editing} mono autoCapitalize="none" autoCorrect={false} placeholder="e.g. flux-schnell, tts-1, whisper-1" error={!!error} hint={editing && !custom ? 'This model comes from the provider, so its id can’t be changed.' : 'Exactly as the provider names it.'} />
      <Field label="Display name (optional)" value={name} onChangeText={setName} autoCapitalize="sentences" />
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Type</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((k) => <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />)}
        </View>
        {kind !== 'chat' && CAP_OF[kind] ? <Note>{`It will appear in the model list for ${KIND_LABEL[kind].toLowerCase()} features.`}</Note> : null}
      </View>
      {!editing && SUGGESTED_MODELS[kind] ? (
        <View style={{ gap: 8 }}>
          <SectionTitle space={0}>{`Common ${KIND_LABEL[kind].toLowerCase()} models`}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTED_MODELS[kind]!.map((m) => <Chip key={m.id} label={m.name} selected={modelId === m.id} onPress={() => { setModelId(m.id); setName(m.name); setError(''); }} />)}
          </View>
          <Note>Tap one to fill the id. Use the id your provider shows, which can differ.</Note>
        </View>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Button label={editing ? 'Save' : 'Add model'} flex onPress={save} disabled={!editing && !modelId.trim()} />
        {custom ? (
          <Button label="Delete" variant="danger" flex onPress={async () => { await useProviders.getState().deleteModel(providerId, existing!.id); router.back(); }} />
        ) : (
          <Button label="Cancel" variant="outline" flex onPress={() => router.back()} />
        )}
      </View>
      {editing && !custom ? <Note>To hide a model from the lists, switch it off in the provider’s model list. A type you set here is kept when models are refreshed.</Note> : null}
    </RouteSheet>
  );
}
