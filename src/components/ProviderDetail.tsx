import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { getApiKey } from '@/lib/keys';
import { KIND_LABEL } from '@/lib/models';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

import { Banner, Button, ListRow } from './Controls';
import { Field } from './Field';
import { Icon } from './Icon';
import { Screen } from './Screen';
import { SearchBar } from './SearchBar';
import { Text } from './Text';
import { Toggle } from './Toggle';

/**
 * One endpoint: its key, models and defaults. A page of its own on a phone or tablet; on a computer it is the
 * right-hand pane of Providers & endpoints (`embedded`).
 */
export function ProviderDetail({ id, embedded, onRemoved }: { id: string; embedded?: boolean; onRemoved?: () => void }) {
  const { colors } = useTheme();
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
  const [more, setMore] = useState(false);
  const temp = useSettings((x) => x.defaultParams.temperature);

  useEffect(() => { getApiKey(id).then((k) => k && setKey(k)); }, [id]);
  if (!p) return null;

  const save = async () => {
    let headers: Record<string, string> = {};
    try {
      headers = headersText.trim() ? JSON.parse(headersText) : {};
    } catch {
      setMore(true);
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
  const paste = async () => {
    const t = (await Clipboard.getStringAsync()).trim();
    if (t) setKey(t);
  };
  const list = models.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  const headerCount = (() => {
    try {
      return headersText.trim() ? Object.keys(JSON.parse(headersText)).length : 0;
    } catch {
      return 0;
    }
  })();
  const actions = (
    <>
      <Button label="Save & test" flex onPress={save} />
      <Button label="Remove" variant="danger" flex onPress={remove} />
    </>
  );

  const body = (
    <>
      {p.status === 'rejected' && (
        <Banner tone="danger" icon="info">The server rejected this key (401). Paste a new one to use these models again.</Banner>
      )}
      {msg ? <Text size={13} color={msg === 'Connected' ? 'accent' : 'warn'} style={{ paddingLeft: 4 }}>{msg}</Text> : null}
      <Field
        label="API key"
        value={key}
        onChangeText={setKey}
        secureTextEntry
        error={p.status === 'rejected'}
        aside={
          <Pressable accessibilityRole="button" onPress={paste} style={{ height: 46, borderRadius: 12, backgroundColor: colors.surface2, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Text size={13.5}>Paste</Text>
          </Pressable>
        }
      />

      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 }}>
          <Text size={12} weight="medium" color="muted">{`Models · ${models.filter((m) => m.enabled).length} of ${models.length} shown in picker`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh models" disabled={refresh.busy} onPress={refresh.run} style={{ height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, opacity: refresh.busy ? 0.5 : 1 }}>
            <Icon name="refresh" size={14} color={colors.text} />
            <Text size={12.5}>{refresh.busy ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        {refresh.note ? <Text size={12.5} color="muted" style={{ paddingHorizontal: 4, paddingBottom: 8 }}>{refresh.note}</Text> : null}
        <SearchBar value={q} onChangeText={setQ} placeholder={`Search ${models.length} models`} />
        {list.slice(0, 100).map((m) => (
          <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/model-edit', params: { providerId: id, id: m.id } })} style={{ minHeight: 48, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text mono size={13} numberOfLines={1}>{m.name}</Text>
              <Text size={11.5} color="muted" numberOfLines={1}>{[m.caps.custom ? 'Added by you' : 'Chat', m.caps.kind && KIND_LABEL[m.caps.kind], m.caps.vision && 'vision', m.caps.tools && 'tools', m.caps.contextK && `${m.caps.contextK}k`].filter(Boolean).join(' · ')}</Text>
            </View>
            <Toggle on={m.enabled} onChange={(v) => useProviders.getState().toggleModel(id, m.id, v)} label={m.name} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/model-edit', params: { providerId: id } })} style={{ minHeight: 48, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="plus" size={16} color={colors.accent} strokeWidth={2} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text size={14} color="accent">Add a custom model</Text>
            <Text size={11.5} color="muted">For models this endpoint doesn’t list</Text>
          </View>
        </Pressable>
      </View>

      <View>
        <ListRow label="Default provider" height={46} toggle={{ on: p.isDefault, onChange: (v) => v && useProviders.getState().setDefault(id) }} />
        <ListRow label="Default model settings" height={46} value={temp === undefined ? 'Provider defaults' : `Temp ${temp}`} onPress={() => router.push('/params-sheet')} />
        <ListRow label="Custom headers & timeout" height={46} value={`${headerCount ? `${headerCount} header${headerCount === 1 ? '' : 's'}` : 'None'} · ${Number(timeout) || 60} s`} onPress={() => setMore(!more)} />
        {more && (
          <View style={{ gap: 14, paddingTop: 8 }}>
            <Field label="Name" value={name} onChangeText={setName} />
            <Field label="Base URL" value={url} onChangeText={setUrl} mono keyboardType="url" />
            <Field label="Custom headers (JSON)" value={headersText} onChangeText={setHeadersText} mono placeholder='{"X-Org": "abc"}' />
            <Field label="Timeout (seconds)" value={timeout} onChangeText={setTimeoutS} keyboardType="number-pad" />
          </View>
        )}
      </View>
    </>
  );

  if (embedded) {
    return (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 28, paddingTop: 18, gap: 16, width: '100%', maxWidth: 640 }}>
        <View style={{ gap: 2 }}>
          <Text size={20} weight="semi">{p.name}</Text>
          <Text mono size={12} color="muted">{p.baseUrl.replace(/^https?:\/\//, '')}</Text>
        </View>
        {body}
        <View style={{ flexDirection: 'row', gap: 8 }}>{actions}</View>
      </ScrollView>
    );
  }
  return (
    <Screen header={{ title: p.name, sub: p.baseUrl.replace(/^https?:\/\//, '') }} footer={actions} gap={16}>
      {body}
    </Screen>
  );
}
