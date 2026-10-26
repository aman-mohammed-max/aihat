import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { DEFAULT_COMFY_WORKFLOW, fetchCheckpoints } from '@/api/images';
import { device } from '@/lib/device';
import { pick } from '@/lib/pick';
import { useSettings, type Settings } from '@/store/settings';
import { useTheme } from '@/theme';

import { Group, ListRow, Note, SectionTitle, Segmented } from './Controls';
import { EndpointRoute } from './EndpointRoute';
import { Field } from './Field';
import { Text } from './Text';

const NONE = '__none__';

/** The little frame drawn in each ratio tile, sized like the picture. */
const FRAME: Record<Settings['imageAspect'], [number, number]> = { '1:1': [18, 18], '3:4': [15, 20], '4:3': [20, 15], '16:9': [24, 14], '9:16': [14, 24] };

/** Five tiles, one per picture shape; the chosen one has an accent outline. */
function AspectTiles() {
  const { colors } = useTheme();
  const s = useSettings();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {(Object.keys(FRAME) as Settings['imageAspect'][]).map((a) => {
        const on = s.imageAspect === a;
        const [w, h] = FRAME[a];
        return (
          <Pressable
            key={a}
            accessibilityRole="button"
            accessibilityLabel={`Aspect ratio ${a}`}
            accessibilityState={{ selected: on }}
            onPress={() => s.set({ imageAspect: a })}
            style={{ flex: 1, height: 60, borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.accent : colors.field, backgroundColor: on ? colors.surface : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <View style={{ width: w, height: h, borderWidth: 1.5, borderColor: on ? colors.text : colors.text2, borderRadius: 3 }} />
            <Text size={12} color={on ? 'text' : 'text2'}>{a}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Everything about how images are made: engine, endpoint + model (fetched from the server), shape and count.
 * `page` is Settings › Images; the chat's Image options sheet uses the compact form.
 */
export function ImageOptionsForm({ showWorkflow, page }: { showWorkflow?: boolean; page?: boolean }) {
  const s = useSettings();
  const [busy, setBusy] = useState(false);

  const chooseCheckpoint = async () => {
    if (!s.imageUrl.trim()) return Alert.alert('Enter the server URL first');
    setBusy(true);
    try {
      const names = await fetchCheckpoints(s.imageEngine as 'a1111' | 'comfyui', s.imageUrl);
      if (!names.length) return Alert.alert('No checkpoints found', 'The server returned an empty list.');
      pick('Checkpoint', [{ value: NONE, label: 'Server default' }, ...names], s.imageModel || NONE, (v) => s.set({ imageModel: v === NONE ? '' : v }));
    } catch (e: any) {
      Alert.alert('Could not fetch checkpoints', `${e.message}\n\nCheck the server URL and that it is reachable from this ${device}.`);
    } finally {
      setBusy(false);
    }
  };

  const engine = (
    <Segmented<Settings['imageEngine']>
      options={[{ value: 'provider', label: 'My endpoint' }, { value: 'comfyui', label: 'ComfyUI' }, { value: 'a1111', label: 'A1111' }]}
      value={s.imageEngine}
      onChange={(imageEngine) => s.set({ imageEngine, imageModel: '' })}
    />
  );

  const where =
    s.imageEngine === 'provider' ? (
      <EndpointRoute cap="images" modelPlaceholder="e.g. flux-schnell" sub={page ? 'Any endpoint you added, or add another' : 'Pick one you added, or add another just for images'} />
    ) : (
      <View style={{ gap: 10 }}>
        <Field label="Server URL" value={s.imageUrl} onChangeText={(imageUrl) => s.set({ imageUrl })} keyboardType="url" mono placeholder={s.imageEngine === 'comfyui' ? 'http://192.168.1.40:8188' : 'http://192.168.1.40:7860'} />
        <Group>
          <ListRow label="Checkpoint" sub="Fetched from the server" monoValue={!!s.imageModel} height={50} value={busy ? 'Fetching…' : s.imageModel || 'Server default'} onPress={chooseCheckpoint} />
        </Group>
        <Field label="Negative prompt" value={s.imageNegative} onChangeText={(imageNegative) => s.set({ imageNegative })} placeholder="blurry, low quality" />
        {s.imageEngine === 'comfyui' && showWorkflow ? (
          <Field
            label="Workflow (API-format JSON, optional)"
            value={s.imageWorkflow}
            onChangeText={(imageWorkflow) => s.set({ imageWorkflow })}
            multiline
            placeholder={DEFAULT_COMFY_WORKFLOW}
            style={{ minHeight: 120, height: undefined, paddingTop: 10, fontSize: 12 }}
            hint="Leave empty for a basic text-to-image graph. Placeholders: {{prompt}} {{negative}} {{model}} {{width}} {{height}} {{n}} {{seed}}."
          />
        ) : null}
      </View>
    );

  const count = (
    <Group>
      <ListRow label="Images per prompt" height={48} value={String(s.imageCount)} onPress={() => pick('Images per prompt', ['1', '2', '3', '4'], String(s.imageCount), (v) => s.set({ imageCount: Number(v) }))} />
    </Group>
  );

  if (page) {
    return (
      <>
        <View style={{ gap: 10 }}>
          <SectionTitle space={0}>Image generation</SectionTitle>
          {engine}
          {where}
          <Note>Calls POST /v1/images/generations. ComfyUI and A1111 use a server URL, a checkpoint list fetched from the server and a negative prompt instead.</Note>
        </View>
        <View style={{ gap: 10 }}>
          <SectionTitle space={0}>Defaults</SectionTitle>
          <AspectTiles />
          {count}
          <ListRow label="Let the chat model improve my prompt" sub="Used by the Image chip and /image" height={46} toggle={{ on: s.imageImprove, onChange: (imageImprove) => s.set({ imageImprove }) }} />
          <Note>In a chat, turn on the Image chip (+ then Create an image) and tap it to change these for that message.</Note>
        </View>
      </>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Engine</SectionTitle>
        {engine}
      </View>
      {where}
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Aspect ratio</SectionTitle>
        <AspectTiles />
      </View>
      {count}
      <Note>Calls POST /v1/images/generations. Some servers ignore the size or count you send.</Note>
    </View>
  );
}
