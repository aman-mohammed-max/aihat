import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { CAPABILITY_LABEL, resolveRoute } from '@/lib/endpoints';
import * as haptic from '@/lib/haptics';
import { KIND_LABEL, type ModelKind } from '@/lib/models';
import { pick } from '@/lib/pick';
import { useProviders } from '@/store/providers';
import { useSettings, type Capability } from '@/store/settings';
import { useTheme } from '@/theme';

import { Group, ListRow, Note } from './Controls';
import { Field } from './Field';
import { Icon } from './Icon';
import { Text } from './Text';

const ADD = '__add__';
const DEFAULT = '__default__';
const NONE = '__none__';
const CUSTOM = '__custom__';

/** The call each feature makes, shown under the endpoint row. */
const CALL: Record<Capability, string> = {
  images: 'POST /v1/images/generations',
  speech: 'POST /v1/audio/speech',
  transcription: 'POST /v1/audio/transcriptions',
  embeddings: 'POST /v1/embeddings',
  search: 'POST /v1/search',
};

/** Which model kind each feature needs, so the picker can show the relevant ones first. */
const KIND_FOR: Partial<Record<Capability, ModelKind>> = { images: 'image', speech: 'speech', transcription: 'transcription', embeddings: 'embedding' };

/**
 * Choose which added endpoint serves a feature (or add another one just for it), then pick its model
 * from that endpoint's own model list, fetched live. "Default endpoint" follows whichever provider is marked default.
 */
type Props = {
  cap: Capability;
  modelLabel?: string;
  modelPlaceholder?: string;
  hint?: string;
  /** The line under the endpoint row (defaults to the call it makes). */
  sub?: string;
};

export function EndpointRoute({ cap, modelLabel = 'Model', modelPlaceholder, hint, sub }: Props) {
  const { colors } = useTheme();
  const providers = useProviders((s) => s.providers);
  const route = useSettings((s) => s.routes[cap]);
  const routes = useSettings((s) => s.routes);
  const set = useSettings((s) => s.set);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const chosen = providers.find((p) => p.id === route.providerId);
  const effective = chosen ?? providers.find((p) => p.isDefault) ?? providers[0];
  const kind = KIND_FOR[cap];

  const update = (patch: Partial<typeof route>) => set({ routes: { ...routes, [cap]: { ...route, ...patch } } });

  const chooseModel = async () => {
    const { provider } = resolveRoute(cap);
    if (!provider) return Alert.alert('Add an endpoint first');
    setBusy(true);
    const r = await useProviders.getState().refreshModels(provider.id);
    setBusy(false);
    if (!r.ok) haptic.error();
    const all = useProviders.getState().models.filter((m) => m.providerId === provider.id);
    const matching = kind ? all.filter((m) => m.caps.kind === kind) : all;
    const addCustom = () => router.push({ pathname: '/model-edit', params: { providerId: provider.id, kind: kind ?? 'chat', select: cap } });
    const open = (list: typeof all) =>
      pick(
        `${modelLabel} · ${provider.name}`,
        [
          { value: NONE, label: 'Provider default', note: 'Let the server choose (for example “auto”)' },
          ...list.map((m) => ({ value: m.id, label: m.name, note: [m.caps.custom ? 'Added by you' : undefined, m.caps.kind ? KIND_LABEL[m.caps.kind] : undefined].filter(Boolean).join(' · ') || undefined })),
          { value: CUSTOM, label: 'Add a custom model…', note: 'Type the model id yourself' },
        ],
        route.model || NONE,
        (v) => {
          if (v === CUSTOM) addCustom();
          else update({ model: v === NONE ? '' : v });
        },
      );

    const what = kind ? KIND_LABEL[kind].toLowerCase() : 'matching';
    const why = r.ok ? '' : `Couldn’t fetch the list (${r.error}). `;
    if (!all.length) {
      return Alert.alert('No models listed', `${why}This endpoint didn’t return any models. You can still use it by adding the model id yourself.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add a custom model', onPress: addCustom },
      ]);
    }
    if (kind && !matching.length) {
      return Alert.alert(`No ${what} models found`, `${why}This endpoint doesn’t label ${what} models in its list. Add the one you want by id, or look through every model.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Show all models', onPress: () => open(all) },
        { text: 'Add a custom model', onPress: addCustom },
      ]);
    }
    if (!r.ok) Alert.alert('Showing saved models', `${why}These are the models saved earlier.`);
    open(matching.length ? matching : all);
  };

  const refreshModels = async () => {
    const { provider } = resolveRoute(cap);
    if (!provider) return;
    setBusy(true);
    await useProviders.getState().refreshModels(provider.id);
    setBusy(false);
  };

  return (
    <View style={{ gap: 0 }}>
      <Group>
        <ListRow
          label={`${CAPABILITY_LABEL[cap]} endpoint`}
          sub={sub ?? CALL[cap]}
          height={50}
          value={chosen ? chosen.name : effective ? `Default · ${effective.name}` : 'None added'}
          onPress={() =>
            pick(
              `${CAPABILITY_LABEL[cap]} endpoint`,
              [
                { value: DEFAULT, label: 'Default endpoint', note: effective && !chosen ? effective.name : 'Follows the default provider' },
                ...providers.map((p) => ({ value: p.id, label: p.name, note: p.baseUrl.replace(/^https?:\/\//, '') })),
                { value: ADD, label: 'Add another endpoint…', note: 'Use a separate server for this feature' },
              ],
              chosen?.id ?? DEFAULT,
              (v) => {
                if (v === ADD) router.push('/add-provider');
                else update({ providerId: v === DEFAULT ? null : v, model: '' });
              },
            )
          }
        />
        <ListRow label={modelLabel} sub={effective ? `Fetched from ${effective.name} when you open the list` : undefined} monoValue={!!route.model} height={50} value={busy ? 'Fetching…' : route.model || 'Provider default'} onPress={chooseModel} />
      </Group>
      {manual ? (
        <View style={{ paddingTop: 10 }}>
          <Field label={`${modelLabel} name`} value={route.model} onChangeText={(model) => update({ model })} placeholder={modelPlaceholder} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" onPress={() => setManual(true)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text size={13} color="accent">Type a model name instead</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={refreshModels} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, opacity: busy ? 0.5 : 1 }}>
            <Icon name="refresh" size={14} color={colors.text2} />
            <Text size={13} color="text2">Refresh models</Text>
          </Pressable>
        </View>
      )}
      {hint ? <Note>{hint}</Note> : null}
    </View>
  );
}
