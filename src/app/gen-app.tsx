import { autoFixSpec, buildUserPrompt, validateSpec } from '@json-render/core';
import { JSONUIProvider, Renderer, type Spec } from '@json-render/react-native';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';

import { streamChat } from '@/api/openai';
import { Header, Icon, PageShell, Text, useColumn } from '@/components';
import { getDb, json } from '@/db';
import { ALLOWED_TYPES, miniAppSystemPrompt } from '@/genui/catalog';
import { normalizeSpec, parseReply } from '@/genui/parse';
import { useLayout } from '@/lib/layout';
import { registry } from '@/genui/registry';
import { isChatModel, useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { fonts, radii, useTheme } from '@/theme';

const KEY = 'genapp.spec';

/** Full-screen mini app: the model returns a UI spec; "Change this app" sends the current spec back and applies its patches. */
export default function GenApp() {
  const { colors, body } = useTheme();
  const { wide } = useLayout();
  const column = useColumn();
  const s = useSettings();
  const provider = useProviders((p) => p.providers.find((x) => x.id === s.defaultProviderId) ?? p.providers.find((x) => x.isDefault) ?? p.providers[0]);
  const models = useProviders((p) => p.models);
  const modelId = s.defaultModelId ?? models.find((m) => m.providerId === provider?.id && m.enabled && isChatModel(m))?.id;
  const [spec, setSpec] = useState<Spec | null>(null);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getDb().then((db) => db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key=?', KEY)).then((r) => setSpec(normalizeSpec(json<Spec | null>(r?.value, null), ALLOWED_TYPES)));
  }, []);

  const run = async () => {
    if (!provider || !modelId) return Alert.alert('Add an endpoint first', 'The mini app needs a chat model.');
    if (!ask.trim()) return;
    setBusy(true);
    try {
      let text = '';
      for await (const ev of streamChat(provider, {
        model: modelId,
        messages: [
          { role: 'system', content: miniAppSystemPrompt() },
          { role: 'user', content: buildUserPrompt({ prompt: ask, currentSpec: spec }) },
        ],
      })) {
        if (ev.type === 'delta') text += ev.text;
      }
      const next = parseReply(text.replace(/<think>[\s\S]*?<\/think>/g, ''), spec).spec;
      if (!next) throw new Error('The model did not return a UI. Try rephrasing, or pick a larger model.');
      const fixed = normalizeSpec(autoFixSpec(normalizeSpec(next, ALLOWED_TYPES) ?? next).spec as Spec, ALLOWED_TYPES);
      if (!fixed || !validateSpec(fixed).valid) throw new Error('The UI it returned was not valid. Try again.');
      setSpec(fixed);
      setAsk('');
      (await getDb()).runAsync('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)', KEY, JSON.stringify(fixed));
    } catch (e: any) {
      Alert.alert('Could not update the app', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header left={wide ? 'none' : 'back'} title="Mini app" />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 16 }, column]} keyboardShouldPersistTaps="handled">
        {spec ? (
          <JSONUIProvider registry={registry} initialState={(spec as { state?: Record<string, unknown> }).state ?? {}}>
            <Renderer spec={spec} registry={registry} loading={busy} />
          </JSONUIProvider>
        ) : (
          <Text color="muted">Describe an app below, for example “a habit tracker with a checklist and a progress bar”.</Text>
        )}
      </ScrollView>
      <View style={[{ padding: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, column]}>
        <TextInput accessibilityLabel="Change this app" value={ask} onChangeText={setAsk} selectionColor={colors.accent} placeholder={spec ? 'Ask to change this app…' : 'Describe the app…'} placeholderTextColor={colors.faint} style={{ flex: 1, minHeight: 46, borderRadius: radii.composer, backgroundColor: colors.surface, paddingHorizontal: 16, color: colors.text, fontFamily: fonts.ui, fontSize: body }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy} onPress={run} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
          <Icon name="send" size={18} color={colors.onAccent} strokeWidth={2.2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    </PageShell>
  );
}
