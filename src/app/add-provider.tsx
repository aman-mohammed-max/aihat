import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Box, Button, Chip, Field, ListRow, Screen, SectionTitle, Text, Toggle } from '@/components';
import * as haptic from '@/lib/haptics';
import { PRESETS, useProviders } from '@/store/providers';
import { useTheme } from '@/theme';

type Result = { ok: true; id: string; ms: number | null } | { ok: false; text: string };

export default function AddProvider() {
  const { colors } = useTheme();
  const [preset, setPreset] = useState<string>('Custom');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [showHeaders, setShowHeaders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const models = useProviders((s) => s.models);
  const store = useProviders();

  const choose = (p: (typeof PRESETS)[number]) => {
    setPreset(p.name);
    if (p.name !== 'Custom') setName(p.name);
    setUrl(p.baseUrl);
  };

  const headers = () => {
    if (!headersText.trim()) return {};
    try {
      return JSON.parse(headersText) as Record<string, string>;
    } catch {
      throw new Error('Custom headers must be a JSON object, e.g. {"X-Org": "abc"}');
    }
  };

  /** Save the endpoint and fetch its models. A failed test leaves nothing half-configured behind. */
  const test = async (): Promise<string | null> => {
    setBusy(true);
    setResult(null);
    try {
      const fields = { name: name.trim() || 'Endpoint', baseUrl: url.trim(), headers: headers(), timeoutMs: 60000 };
      let id = result?.ok ? result.id : null;
      if (id) await store.update(id, fields, key.trim() || undefined);
      else id = await store.add(fields, key.trim() || undefined);
      const r = await useProviders.getState().refreshModels(id);
      if (r.ok) {
        haptic.success();
        setResult({ ok: true, id, ms: useProviders.getState().providers.find((p) => p.id === id)?.latencyMs ?? null });
        return id;
      }
      haptic.error();
      await useProviders.getState().remove(id);
      setResult({ ok: false, text: r.error ?? 'Could not connect' });
      return null;
    } catch (e: any) {
      setResult({ ok: false, text: e?.message ?? 'Could not connect' });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const id = result?.ok ? result.id : await test();
    if (!id) return;
    if (result?.ok) await store.update(id, { name: name.trim() || 'Endpoint', baseUrl: url.trim(), headers: headers(), timeoutMs: 60000 }, key.trim() || undefined);
    router.dismissTo('/');
  };

  const cancel = async () => {
    if (result?.ok) await useProviders.getState().remove(result.id);
    router.back();
  };

  const found = result?.ok ? models.filter((m) => m.providerId === result.id) : [];

  return (
    <Screen
      header={{ left: 'cancel', onLeft: cancel, title: 'New endpoint', right: 'text', rightText: busy ? 'Testing…' : 'Save', onRightText: save }}
      footer={<Button label={busy ? 'Testing…' : 'Test connection'} variant="outline" flex height={48} onPress={() => void test()} disabled={busy || !url.trim()} />}
      gap={14}>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>Start from</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {PRESETS.map((p) => <Chip key={p.name} label={p.name} selected={preset === p.name} onPress={() => choose(p)} />)}
        </View>
      </View>
      <Field label="Name" value={name} onChangeText={setName} placeholder="My endpoint" autoCapitalize="sentences" />
      <Field label="Base URL" value={url} onChangeText={setUrl} keyboardType="url" mono placeholder="http://192.168.1.40:8000/v1" hint="Calls /models and /chat/completions (include /v1)" />
      <Field label="API key (optional)" value={key} onChangeText={setKey} secureTextEntry />
      <ListRow label="Custom headers" height={44} value={headersText.trim() ? 'Set' : 'None'} onPress={() => setShowHeaders(!showHeaders)} />
      {showHeaders && <Field label="Custom headers (JSON)" value={headersText} onChangeText={setHeadersText} mono placeholder='{"X-Org": "abc"}' />}

      {result && !result.ok && (
        <Banner tone="danger">{result.text}</Banner>
      )}
      {result?.ok && (
        <Box>
          <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: found.length ? 1 : 0, borderBottomColor: colors.surface2 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
            <Text size={14} weight="medium" style={{ flex: 1 }}>{`Connected · ${found.length} model${found.length === 1 ? '' : 's'}`}</Text>
            {result.ms ? <Text mono size={11.5} color="muted">{result.ms} ms</Text> : null}
          </View>
          {found.slice(0, 50).map((m) => (
            <View key={m.id} style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text mono size={13} numberOfLines={1} style={{ flex: 1 }}>{m.name}</Text>
              <Text size={11.5} color="muted">{[m.caps.kind && m.caps.kind !== 'chat' ? m.caps.kind : m.caps.vision ? 'vision' : m.caps.tools ? 'tools' : '', m.caps.contextK && `${m.caps.contextK}k`].filter(Boolean).join(' · ')}</Text>
              <Toggle on={m.enabled} onChange={(v) => useProviders.getState().toggleModel(result.id, m.id, v)} label={m.name} />
            </View>
          ))}
        </Box>
      )}
    </Screen>
  );
}
