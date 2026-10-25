import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, Field, ListRow, Screen, SectionTitle } from '@/components';
import * as haptic from '@/lib/haptics';
import { PRESETS, useProviders } from '@/store/providers';

export default function AddProvider() {
  const [preset, setPreset] = useState<string>('Custom');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const store = useProviders();

  const choose = (p: (typeof PRESETS)[number]) => {
    setPreset(p.name);
    if (p.name !== 'Custom') setName(p.name);
    setUrl(p.baseUrl);
  };

  const test = async () => {
    setBusy(true);
    setResult(null);
    const id = await store.add({ name: name.trim() || 'Endpoint', baseUrl: url.trim(), headers: {}, timeoutMs: 60000 }, key.trim() || undefined);
    const r = await useProviders.getState().refreshModels(id);
    setBusy(false);
    if (r.ok) {
      haptic.success();
      const count = useProviders.getState().models.filter((m) => m.providerId === id).length;
      setResult({ ok: true, text: `Connected · ${count} models` });
      setTimeout(() => router.dismissTo('/'), 700);
    } else {
      haptic.error();
      setResult({ ok: false, text: r.error ?? 'Could not connect' });
      await useProviders.getState().remove(id); // keep nothing half-configured; user edits and retries
    }
  };

  return (
    <Screen header={{ left: 'back', title: 'New endpoint' }} footer={<Button label={busy ? 'Testing…' : 'Test & add'} flex onPress={test} disabled={busy || !url.trim()} />}>
      <View>
        <SectionTitle>Start from</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map((p) => <Chip key={p.name} label={p.name} selected={preset === p.name} onPress={() => choose(p)} />)}
        </View>
      </View>
      <Field label="Name" value={name} onChangeText={setName} placeholder="My endpoint" autoCapitalize="sentences" />
      <Field label="Base URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="http://192.168.1.40:8000/v1" hint="Include /v1. Used for /models, /chat/completions and, if you pick it, images, speech, embeddings and search." />
      <Field label="API key (optional)" value={key} onChangeText={setKey} secureTextEntry hint="Stored in this device's keystore. Never backed up." />
      {result && (
        <Card>
          <ListRow label={result.text} icon={result.ok ? 'check' : 'warn'} danger={!result.ok} last />
        </Card>
      )}
    </Screen>
  );
}
