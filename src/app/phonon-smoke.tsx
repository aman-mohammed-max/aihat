import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { phononTranscribe, usePhonon } from '@/lib/local/phonon';

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

    await record('passed', transcript);
    return `PHONON_SMOKE_PASS ${transcript}`;
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
