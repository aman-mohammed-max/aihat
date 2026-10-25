import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { getApiKey } from '@/lib/keys';
import { KIND_LABEL } from '@/lib/models';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useProviders } from '@/store/providers';

import { Button, Card, ListRow, SectionTitle } from './Controls';
import { Field } from './Field';
import { Screen } from './Screen';
import { SearchBar } from './SearchBar';
import { Text } from './Text';

/**
 * One endpoint: its address, key, headers and models. A page of its own on a phone or tablet; on a computer it is
 * the right-hand pane of Providers & endpoints (`embedded`).
 */
export function ProviderDetail({ id, embedded, onRemoved }: { id: string; embedded?: boolean; onRemoved?: () => void }) {
  const p = useProviders((s) => s.providers.find((x) => x.id === id));
  const allModels = useProviders((s) => s.models);
  const models = useMemo(() => allModels.filter((m) => m.providerId === id), [allModels, id]);
  const [q, setQ] = useState('');
  const refresh = useRefreshModels(id);
  const [key, setKey] = useState('');
  const [name, setName] = useState(p?.name ?? '');
  const [url, setUrl] = useState(p?.baseUrl ?? '');
  const [timeout, setTimeoutS] = useState(String((p?.timeoutMs ?? 60000) / 1000));
  const [msg, setMsg] = useState('');
  const [headersText, setHeadersText] = useState(p && Object.keys(p.headers).length ? JSON.stringify(p.headers) : '');

  useEffect(() => { getApiKey(id).then((k) => k && setKey(k)); }, [id]);
  if (!p) return null;

  const save = async () => {
    let headers: Record<string, string> = {};
    try {
      headers = headersText.trim() ? JSON.parse(headersText) : {};
    } catch {
      return setMsg('Custom headers must be a JSON object, e.g. {"X-Org": "abc"}');
    }
    await useProviders.getState().update(id, { name, baseUrl: url, timeoutMs: (Number(timeout) || 60) * 1000, headers }, key);
    const r = await useProviders.getState().refreshModels(id);
    setMsg(r.ok ? 'Connected' : r.error ?? 'Failed');
  };
  const remove = async () => {
    await useProviders.getState().remove(id);
    if (onRemoved) onRemoved();
    else router.back();
  };
  const list = models.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  const actions = (
    <>
      <Button label="Save & test" flex={!embedded} onPress={save} />
      <Button label="Remove provider" variant={embedded ? 'outline' : 'danger'} onPress={remove} />
    </>
  );

  const body = (
    <>
      {p.status === 'rejected' && (
        <Card><ListRow icon="warn" danger label="The server rejected this key (401). Paste a new one to use these models again." last /></Card>
      )}
      {msg ? <Text color={msg === 'Connected' ? 'accent' : 'warn'}>{msg}</Text> : null}
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Base URL" value={url} onChangeText={setUrl} />
      <Field label="API key" value={key} onChangeText={setKey} secureTextEntry />
      <Field label="Custom headers (JSON, optional)" value={headersText} onChangeText={setHeadersText} placeholder='{"X-Org": "abc"}' />
      <Field label="Timeout (seconds)" value={timeout} onChangeText={setTimeoutS} keyboardType="number-pad" />

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionTitle>{`Models · ${models.filter((m) => m.enabled).length} of ${models.length} shown in picker`}</SectionTitle>
          <Button label={refresh.busy ? 'Refreshing…' : 'Refresh'} variant="outline" height={36} onPress={refresh.run} disabled={refresh.busy} />
        </View>
        {refresh.note ? <Text size={12.5} color="muted">{refresh.note}</Text> : null}
        <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${models.length} models`} />
        <Card>
          {list.slice(0, 100).map((m) => (
            <ListRow key={m.id} mono label={m.name} sub={[m.caps.custom && 'Added by you', m.caps.kind && KIND_LABEL[m.caps.kind], m.caps.vision && 'vision', m.caps.tools && 'tools'].filter(Boolean).join(' · ') || undefined} onPress={() => router.push({ pathname: '/model-edit', params: { providerId: id, id: m.id } })} toggle={{ on: m.enabled, onChange: (v) => useProviders.getState().toggleModel(id, m.id, v) }} last={false} />
          ))}
          <ListRow icon="plus" label="Add a custom model" sub="For models this endpoint doesn’t list" onPress={() => router.push({ pathname: '/model-edit', params: { providerId: id } })} last />
        </Card>
      </View>

      <Card>
        <ListRow label="Default provider" toggle={{ on: p.isDefault, onChange: (v) => v && useProviders.getState().setDefault(id) }} />
        <ListRow label="Default model settings" onPress={() => router.push('/params-sheet')} last />
      </Card>
    </>
  );

  if (embedded) {
    return (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 28, paddingTop: 18, gap: 20, width: '100%', maxWidth: 640 }}>
        <Text size={20} weight="semi">{p.name}</Text>
        {body}
        <View style={{ flexDirection: 'row', gap: 10 }}>{actions}</View>
      </ScrollView>
    );
  }
  return (
    <Screen header={{ title: p.name }} footer={actions}>
      {body}
    </Screen>
  );
}
