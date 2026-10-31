import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { streamLocal } from '@/lib/local/engine';
import { PICKED } from '@/lib/local/catalog';
import { modelId } from '@/lib/local/files';
import { phononTranscribe, usePhonon } from '@/lib/local/phonon';
import { useLocalInference } from '@/store/localInference';
import { useLocalModels } from '@/store/localModels';

const enabled = process.env.EXPO_PUBLIC_PHONON_E2E === '1';
const marker = new File(Paths.document, 'phonon-smoke-result.json');
let smokeRun: Promise<string> | null = null;

async function record(status: string, details?: string) {
  marker.create({ overwrite: true });
  await marker.write(JSON.stringify({ status, details }));
}

function runSmoke() {
  if (smokeRun) return smokeRun;
  smokeRun = (async () => {
    await record('downloading');
    await usePhonon.getState().download();

    await record('transcribing');
    const audio = await Asset.fromModule(require('../../assets/phonon-smoke.wav')).downloadAsync();
    if (!audio.localUri) throw new Error('The speech fixture was not copied to local storage.');
    const transcript = await phononTranscribe(audio.localUri);
    const normalized = transcript.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!normalized.includes('transcribe') || !normalized.includes('sentence')) {
      throw new Error(`Speech inference returned an unexpected transcript: ${transcript || '(empty)'}`);
    }

    // Release the speech model before loading the chat model; both are large native runtimes.
    usePhonon.getState().remove();
    await record('llm-downloading');
    await useLocalModels.getState().load();
    const model = PICKED[0];
    const id = modelId(model.repo, model.file);
    await useLocalModels.getState().download(model);
    const downloadState = useLocalModels.getState();
    if (!downloadState.models.some((installed) => installed.id === id)) {
      throw new Error(downloadState.jobs[id]?.error ?? 'The downloaded chat model was not installed.');
    }

    await record('llm-generating');
    const response: string[] = [];
    let finished = false;
    for await (const event of streamLocal(id, [
      { role: 'system', content: 'Reply with exactly the single word READY.' },
      { role: 'user', content: 'Say the required word.' },
    ], { maxTokens: 32, temperature: 0 })) {
      if (event.type === 'delta') response.push(event.text);
      if (event.type === 'done') finished = true;
    }
    const answer = response.join('').trim();
    if (!finished || !/\bready\b/i.test(answer)) {
      throw new Error(`Local LLM returned an unexpected response: ${answer || '(empty)'}`);
    }
    const inference = useLocalInference.getState();
    if (inference.phase !== 'loaded') throw new Error('The local LLM did not remain loaded after inference.');

    const details = JSON.stringify({ transcript, model: id, answer, backend: inference.backendLabel, fallback: inference.fallbackReason });
    await record('passed', details);
    return `PHONON_SMOKE_PASS ${transcript} LLM_SMOKE_PASS ${model.name} ${inference.backendLabel ?? 'backend unknown'} ${answer}`;
  })().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await record('failed', message);
    } catch {
      // The visible status and native logs remain available if marker storage fails.
    }
    throw error;
  });
  return smokeRun;
}

export default function PhononSmoke() {
  const [status, setStatus] = useState(enabled ? 'PHONON_SMOKE_RUNNING' : 'PHONON_SMOKE_DISABLED');

  useEffect(() => {
    if (!enabled) return;
    runSmoke().then(
      setStatus,
      (error: unknown) => setStatus(`PHONON_SMOKE_FAILED ${error instanceof Error ? error.message : String(error)}`),
    );
  }, []);

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      <Text accessibilityLabel={status} selectable>{status}</Text>
    </View>
  );
}
