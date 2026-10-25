import { useState } from 'react';
import { Alert, View } from 'react-native';

import { DEFAULT_COMFY_WORKFLOW, fetchCheckpoints } from '@/api/images';
import { pick } from '@/lib/pick';
import { useSettings, type Settings } from '@/store/settings';
import { device } from '@/lib/device';

import { Card, ListRow, SectionTitle, Segmented } from './Controls';
import { EndpointRoute } from './EndpointRoute';
import { Field } from './Field';
import { Text } from './Text';

const NONE = '__none__';

/**
 * Everything about how images are made: engine, endpoint + model (fetched from the server),
 * ratio, count. Used by the chat's Image options sheet and by Settings → Images.
 */
export function ImageOptionsForm({ showWorkflow }: { showWorkflow?: boolean }) {
  const s = useSettings();
  const [busy, setBusy] = useState(false);
  const local = s.imageEngine === 'comfyui' || s.imageEngine === 'a1111';

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

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <SectionTitle>Engine</SectionTitle>
        <Segmented<Settings['imageEngine']>
          options={[{ value: 'provider', label: 'My endpoint' }, { value: 'comfyui', label: 'ComfyUI' }, { value: 'a1111', label: 'A1111' }]}
          value={s.imageEngine}
          onChange={(imageEngine) => s.set({ imageEngine, imageModel: '' })}
        />
      </View>

      {s.imageEngine === 'provider' ? (
        <EndpointRoute cap="images" modelPlaceholder="e.g. flux-schnell" hint="Calls POST /v1/images/generations on the endpoint you pick." />
      ) : (
        <>
          <Field label="Server URL" value={s.imageUrl} onChangeText={(imageUrl) => s.set({ imageUrl })} keyboardType="url" placeholder={s.imageEngine === 'comfyui' ? 'http://192.168.1.40:8188' : 'http://192.168.1.40:7860'} />
          <Card><ListRow label="Checkpoint" mono={!!s.imageModel} value={busy ? 'Fetching…' : s.imageModel || 'Server default'} onPress={chooseCheckpoint} last /></Card>
          <Field label="Negative prompt" value={s.imageNegative} onChangeText={(imageNegative) => s.set({ imageNegative })} placeholder="blurry, low quality" />
        </>
      )}

      {s.imageEngine === 'comfyui' && showWorkflow ? (
        <Field
          label="Workflow (API-format JSON, optional)"
          value={s.imageWorkflow}
          onChangeText={(imageWorkflow) => s.set({ imageWorkflow })}
          multiline
          placeholder={DEFAULT_COMFY_WORKFLOW}
          style={{ minHeight: 120, paddingTop: 10, fontSize: 12 }}
          hint="Leave empty for a basic text-to-image graph. Placeholders: {{prompt}} {{negative}} {{model}} {{width}} {{height}} {{n}} {{seed}}."
        />
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionTitle>Aspect ratio</SectionTitle>
        <Segmented<Settings['imageAspect']>
          options={[{ value: '1:1', label: '1:1' }, { value: '3:4', label: '3:4' }, { value: '4:3', label: '4:3' }, { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }]}
          value={s.imageAspect}
          onChange={(imageAspect) => s.set({ imageAspect })}
        />
      </View>
      <Card>
        <ListRow label="Images per prompt" value={String(s.imageCount)} onPress={() => pick('Images per prompt', ['1', '2', '3', '4'], String(s.imageCount), (v) => s.set({ imageCount: Number(v) }))} last />
      </Card>
      {local ? null : <Text size={12} color="muted">Some servers ignore the size or count you send.</Text>}
    </View>
  );
}
